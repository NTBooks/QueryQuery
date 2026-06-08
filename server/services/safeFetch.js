// SSRF guard for outbound requests whose URL is influenced by user input. Checks
// the scheme, then resolves the host and rejects any address in a private,
// loopback, link-local, CGNAT, or cloud-metadata range. Auto-redirects are
// disabled and each hop is re-validated. (A single-resolve TOCTOU window remains
// — there is no kernel-level IP pin — but the metadata/internal-scan paths close.)
import dns from 'node:dns/promises';
import net from 'node:net';

function ipv4Forbidden(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast, 240/4 reserved, 255.255.255.255
  return false;
}

function ipv6Forbidden(ip) {
  const v = ip.toLowerCase().split('%')[0]; // drop any zone id
  if (v === '::1' || v === '::') return true; // loopback / unspecified
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/); // IPv4-mapped
  if (mapped) return ipv4Forbidden(mapped[1]);
  if (/^fe[89ab]/.test(v)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(v)) return true; // fc00::/7 unique-local
  if (v.startsWith('ff')) return true; // multicast
  return false; // global unicast
}

export function ipForbidden(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4Forbidden(ip);
  if (kind === 6) return ipv6Forbidden(ip);
  return true; // unrecognized → refuse
}

/**
 * Throw unless `input` is safe to fetch (allowed scheme, public host). Returns
 * { url, addrs }. Set allowHttp for trusted loopback callers (not user URLs).
 */
export async function assertPublicUrl(input, { allowHttp = false } = {}) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new Error('Invalid URL.');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('URL must use https.');
  }
  if (url.username || url.password) throw new Error('URL must not embed credentials.');

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  let addrs;
  if (net.isIP(host)) {
    addrs = [host];
  } else {
    try {
      addrs = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new Error('Could not resolve host.');
    }
  }
  if (!addrs.length) throw new Error('Could not resolve host.');
  for (const ip of addrs) {
    if (ipForbidden(ip)) throw new Error('URL resolves to a disallowed (private or internal) address.');
  }
  return { url, addrs };
}

/**
 * fetch() with SSRF validation, a timeout, and manual redirect following where
 * every hop is re-validated. Throws on a disallowed URL or too many redirects.
 */
export async function safeFetch(input, options = {}, { allowHttp = false, timeoutMs = 30000, maxRedirects = 3 } = {}) {
  let target = String(input);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(target, { allowHttp });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(target, { ...options, redirect: 'manual', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!loc) return res;
    target = new URL(loc, target).toString(); // re-validated at the top of the next pass
  }
  throw new Error('Too many redirects.');
}

export default safeFetch;
