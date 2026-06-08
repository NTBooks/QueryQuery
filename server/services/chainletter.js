// Chainletter webhook client: compute an IPFS CID locally (no upload), register
// the hash, and blockchain-stamp it.
//
// Bootstrap from the single token URL by CLAIMING it once:
//   GET {tokenUrl}?claim=true -> { success, tenant, webhookurl, jwt, groupname, expires }
// The claim is SINGLE-USE (re-claiming -> 410 "Token no longer available"), so we
// cache {webhookurl, jwt, groupname, tenant, expires} and reuse until it expires.
//
// Webhook contract (auth = Authorization: Bearer {jwt}):
//   POST  {webhookurl}  headers: group-id, auth  body {hash,name,size,mimetype} -> register (409 = exists)
//   PATCH {webhookurl}  headers: group-id, auth                                 -> stamp -> {success,message,files_stamped}
//   GET   {webhookurl}  headers: hash, auth   (NOT group-id — sending both 400s) -> verify
import Hash from 'ipfs-only-hash';
import { safeFetch } from './safeFetch.js';

const EMPTY_FILE_CID = 'QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH';

/** Hide the secret path of a webhook/token URL in logs (the path IS the API key). */
export function redactUrl(u) {
  try {
    return `${new URL(String(u)).origin}/…`;
  } catch {
    return '«url»';
  }
}

/** Compute the CIDv0 (Qm...) IPFS/Pinata would produce for these bytes — no upload. */
export async function computeCid(buffer) {
  return Hash.of(buffer, { cidVersion: 0 });
}

export function guessMime(name) {
  return String(name).toLowerCase().endsWith('.eml') ? 'message/rfc822' : 'text/plain';
}

function authHeaders(cl) {
  if (cl.jwt) return { Authorization: `Bearer ${cl.jwt}` };
  if (cl.secret) return { 'secret-key': cl.secret };
  return {};
}

/** Describe the auth mode for logs WITHOUT leaking the secret value. */
function authMode(cl) {
  if (cl.jwt) return `bearer(…${String(cl.jwt).slice(-4)})`;
  if (cl.secret) return `secret-key(len=${String(cl.secret).length})`;
  return 'NONE';
}

const trunc = (s, n = 300) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');

/** Shared request wrapper: builds headers, logs request+response (redacted), returns raw text. */
async function clFetch(cl, method, { headers = {}, body, label, omitGroup = false } = {}) {
  const url = cl.webhookUrl;
  const h = { ...(omitGroup ? {} : { 'group-id': cl.groupId || '' }), ...authHeaders(cl), ...headers };
  if (body) h['Content-Type'] = 'application/json';
  // eslint-disable-next-line no-console
  console.log(`[chainletter] ${label} ${method} ${redactUrl(url)} (group-id=${cl.groupId || '∅'}, auth=${authMode(cl)})`);
  const res = await fetchWithTimeout(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const benign = res.ok || res.status === 404 || res.status === 409;
  // eslint-disable-next-line no-console
  (benign ? console.log : console.error)(`[chainletter] ${label} -> HTTP ${res.status}${benign ? '' : `: ${trunc(text)}`}`);
  return { res, status: res.status, text };
}

// All Chainletter endpoints (the user's token URL and the claim-returned webhook
// URL) must be public https hosts — route every outbound call through the SSRF
// guard so a crafted token/webhook can't reach internal or metadata addresses.
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  return safeFetch(url, options, { timeoutMs });
}

function friendly(status, detail) {
  const d = detail ? `: ${detail}` : '';
  switch (status) {
    case 400: return `Bad request${d}`;
    case 401: return `Unauthorized${d || ' — check your secret key or JWT.'}`;
    case 403: return `Forbidden${d || ' — your key may lack access to this folder.'}`;
    case 404: return `Not found${d || ' — check the webhook URL and group-id.'}`;
    case 408: return 'Request timed out — try again.';
    case 409: return 'Already registered.';
    case 429: return 'Rate limited — wait a moment and try again.';
    default: return `Chainletter error (HTTP ${status})${d}`;
  }
}

function detailFrom(text) {
  try {
    const j = JSON.parse(text);
    return j.message || j.error || text;
  } catch {
    return text;
  }
}

async function readDetail(res) {
  try {
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      return j.message || j.error || txt;
    } catch {
      return txt;
    }
  } catch {
    return '';
  }
}

function clError(cl, status, text, method) {
  const detail = detailFrom(text);
  const err = new Error(friendly(status, detail));
  err.status = status;
  err.detail = detail;
  err.method = method;
  err.endpoint = cl.webhookUrl;
  err.groupId = cl.groupId;
  err.authMode = authMode(cl);
  return err;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Register a hash without uploading the file. 409 is treated as success. */
export async function registerHash(cl, { hash, name, size, mimetype }) {
  const { res, status, text } = await clFetch(cl, 'POST', { body: { hash, name, size, mimetype }, label: 'register' });
  if (status === 409) return { ok: true, alreadyExists: true };
  if (!res.ok) throw clError(cl, status, text, 'POST');
  return { ok: true, alreadyExists: false, body: parseJson(text) };
}

/** Blockchain-stamp the collection. Returns {success, message, files_stamped}. */
export async function stamp(cl) {
  const { res, status, text } = await clFetch(cl, 'PATCH', { label: 'stamp' });
  if (!res.ok) throw clError(cl, status, text, 'PATCH');
  return parseJson(text) || { success: true };
}

/** Verify a hash. Returns {found, body}. Sends ONLY the hash header (group-id+hash 400s). */
export async function verify(cl, hash) {
  const { res, status, text } = await clFetch(cl, 'GET', { headers: { hash }, label: 'verify', omitGroup: true });
  if (status === 404) return { found: false };
  if (!res.ok) throw clError(cl, status, text, 'GET');
  return { found: true, body: parseJson(text) };
}

function serverHost(webhookUrl) {
  try {
    return new URL(webhookUrl).host;
  } catch {
    return '';
  }
}

/** Pick a verification link: prefer one the API returns, else fill the template. */
export function buildVerifyUrl(cl, cid, ...bodies) {
  for (const b of bodies) {
    if (b && typeof b === 'object') {
      const u = b.verifyUrl || b.verificationUrl || b.url || b.link;
      // Only trust http(s) links from the API — never a javascript:/data: URL that
      // would become an XSS sink when rendered as an <a href> in the client.
      if (u && /^https?:\/\//i.test(String(u))) return u;
    }
  }
  // Author-facing verification link lives on the public tenant host.
  const server = cl.tenant || serverHost(cl.webhookUrl);
  return String(cl.verifyUrlTemplate || 'https://{server}/verify/{cid}')
    .replace('{server}', server)
    .replace('{cid}', cid);
}

/**
 * Upload a file to Chainletter's PRIVATE network and blockchain-stamp it in one call.
 * (Hash-only registration cannot be stamped — the stamp operation needs a stored file.)
 * Returns {success, message, hash, name, size, network, files_stamped}.
 */
export async function uploadAndStamp(cl, { buffer, name, mimetype, network = 'private' }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype || guessMime(name) }), name);
  // eslint-disable-next-line no-console
  console.log(`[chainletter] upload POST ${redactUrl(cl.webhookUrl)} (group-id=${cl.groupId || '∅'}, network=${network}, stamp=immediate, auth=${authMode(cl)})`);
  // NOTE: do NOT set Content-Type — fetch sets the multipart boundary for FormData.
  const res = await fetchWithTimeout(cl.webhookUrl, {
    method: 'POST',
    headers: { 'group-id': cl.groupId || '', network, 'stamp-immediately': 'true', ...authHeaders(cl) },
    body: form,
  });
  const text = await res.text();
  const data = parseJson(text);
  const benign = res.ok && data?.success;
  // eslint-disable-next-line no-console
  (benign ? console.log : console.error)(`[chainletter] upload -> HTTP ${res.status}${benign ? ` (${data.message})` : `: ${trunc(text)}`}`);
  if (!benign) throw clError(cl, res.status, text, 'POST');
  return data;
}

/**
 * Certify the query TEXT: stamp the base64 of it (a tiny .txt) and return that base64
 * as the author's portable "proof token". The durable proof is the on-chain stamp of
 * its hash + the base64 the author keeps — we don't rely on any retained original file.
 */
export async function certifyText(cl, { text, name }) {
  const b64 = Buffer.from(String(text), 'utf8').toString('base64');
  const fileName = `${String(name || 'query').replace(/[^\w.-]/g, '_')}.b64.txt`;
  const up = await uploadAndStamp(cl, { buffer: Buffer.from(b64, 'utf8'), name: fileName, mimetype: 'text/plain' });
  return {
    hash: up.hash, // CID of the base64 bytes — recomputable by the author from the token
    stampData: b64,
    network: up.network,
    stamp: { success: up.success, message: up.message, files_stamped: up.files_stamped },
    verifyUrl: buildVerifyUrl(cl, up.hash, up),
  };
}

/** Full certify flow for raw bytes (e.g. a file): upload privately, stamp, return verify link. */
export async function certifyBytes(cl, { buffer, name, mimetype }) {
  const localCid = await computeCid(buffer); // cross-check against the server's CID
  const up = await uploadAndStamp(cl, { buffer, name, mimetype });
  const hash = up.hash || localCid;
  if (up.hash && up.hash !== localCid) {
    // eslint-disable-next-line no-console
    console.warn(`[chainletter] CID mismatch: local=${localCid} server=${up.hash}`);
  }
  const verifyUrl = buildVerifyUrl(cl, hash, up);
  return {
    hash,
    alreadyExists: false,
    network: up.network,
    stamp: { success: up.success, message: up.message, files_stamped: up.files_stamped },
    verifyUrl,
  };
}

// --- Token bootstrap: claim the single token URL once, then cache + reuse ---

/** Claim a /jwt/{token} shortlink -> {success, tenant, webhookurl, jwt, groupname, expires}. SINGLE-USE. */
export async function claimToken(tokenUrl) {
  const url = new URL(tokenUrl);
  url.searchParams.set('claim', 'true');
  let res;
  try {
    res = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' }, redirect: 'follow' }, 15000);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Timed out reaching the token URL.' : `Could not reach the token URL: ${e.message}`);
  }
  const text = await res.text();
  const data = parseJson(text);
  if (res.status === 410 || /no longer available/i.test(text)) {
    const err = new Error('This token URL was already claimed. Paste a fresh token URL from your Chainletter account.');
    err.status = 410;
    throw err;
  }
  if (!res.ok || !data?.success || !data.webhookurl) {
    throw new Error(data?.message || `Could not claim the token URL (HTTP ${res.status}).`);
  }
  return data;
}

function claimToCreds(cl, c) {
  return {
    webhookUrl: c.webhookurl,
    jwt: c.jwt || '',
    groupId: c.groupname || '',
    tenant: c.tenant || '', // public host — used for the author verification link
    expires: c.expires || '',
    status: 'Active',
    secret: '',
    verifyUrlTemplate: cl.verifyUrlTemplate || 'https://{server}/verify/{cid}',
  };
}

/**
 * Resolve ready-to-use credentials from a per-user chainletter store. Reuses the
 * cached claim while valid; otherwise claims the token URL once (single-use) and
 * persists it via cl.saveClaim(fresh).
 * @param {{tokenUrl:string, claim?:object, verifyUrlTemplate?:string, saveClaim?:Function}} cl
 */
export async function resolveCredentials(cl) {
  cl = cl || {};
  const tokenUrl = (cl.tokenUrl || '').trim();
  if (!tokenUrl) throw new Error('Enter your Chainletter token URL.');
  if (!/\/jwt\//.test(tokenUrl)) throw new Error('That doesn’t look like a token URL (expected …/jwt/…).');

  const cached = cl.claim;
  const validCache =
    cached && cached.webhookurl && cached.tokenUrl === tokenUrl &&
    cached.expires && Date.parse(cached.expires) > Date.now() + 60_000;
  if (validCache) return claimToCreds(cl, cached);

  const data = await claimToken(tokenUrl); // throws (410 etc.) with a friendly message
  const fresh = {
    tokenUrl,
    webhookurl: data.webhookurl,
    jwt: data.jwt,
    groupname: data.groupname,
    tenant: data.tenant,
    expires: data.expires,
  };
  if (typeof cl.saveClaim === 'function') {
    try {
      cl.saveClaim(fresh); // claim is single-use -> persist so we never re-claim
    } catch {
      /* best-effort; the returned creds still work for this call */
    }
  }
  return claimToCreds(cl, fresh);
}

/** Resolve (claim+cache if needed), then verify connectivity/auth against the webhook. */
export async function testConnection(clStore) {
  let cl;
  try {
    cl = await resolveCredentials(clStore);
  } catch (e) {
    // 410 = the single-use token link was already claimed → user needs a fresh one.
    return { ok: false, message: e.message, needsFreshToken: e.status === 410 };
  }
  const base = { tenant: cl.tenant, folder: cl.groupId, expires: cl.expires, status: cl.status };
  try {
    const res = await fetchWithTimeout(cl.webhookUrl, { method: 'GET', headers: { hash: EMPTY_FILE_CID, ...authHeaders(cl) } }, 12000);
    if ((res.headers.get('content-type') || '').includes('text/html')) {
      return { ok: false, message: `That URL serves a web page, not the webhook API (${serverHost(cl.webhookUrl)}).`, ...base };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Webhook rejected the credentials — the token may have expired; paste a fresh token URL.', needsFreshToken: true, ...base };
    }
    // 200 / 404 / 400 all mean we reached an authenticated API endpoint.
    if (res.ok || res.status === 404 || res.status === 400) {
      return { ok: true, message: `Connected to ${cl.tenant} (folder ${cl.groupId}).`, ...base };
    }
    return { ok: false, message: friendly(res.status, await readDetail(res)), ...base };
  } catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'Timed out reaching Chainletter.' : e.message, ...base };
  }
}
