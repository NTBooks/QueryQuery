// Server-side client for LM Studio's OpenAI-compatible local API.
// The browser never calls LM Studio directly (CORS is off by default) — it goes
// through these helpers via /api/llm/*.

function baseUrl(config) {
  return (config.llm?.baseUrl || 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
}

function authHeaders(config) {
  const key = config.llm?.apiKey;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Strict IPv4 octets (0-255, no leading zeros) so we don't match CSS/SVG numbers.
const IPV4 = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}';
// IPv6 (full + compressed forms). Only matched next to an IP label (below) to
// avoid CSS false positives like "::before".
const IPV6 =
  '(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|' +
  '(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|' +
  '(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|' +
  '(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}|' +
  '::(?:[0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})';
const LABEL = "(?:client[_-]?ip|your ip(?: address)?|ip address|cf-connecting-ip|remote_addr)[\"'\\s:=>]{0,16}";
// Grab the whole IP-ish token after a label, then validate with ANCHORED regexes
// (anchoring makes IPv6 backtracking pick the full address, not a `::` prefix).
const LABELED_TOKEN = new RegExp(`${LABEL}([0-9A-Fa-f:.]{2,45})`, 'i');
const V4_RE = new RegExp(`^${IPV4}$`);
const V6_RE = new RegExp(`^${IPV6}$`);
const STRICT_V4 = new RegExp(IPV4, 'g');

/** Find the most likely client IP (v4 or v6) in an error page, avoiding false positives. */
function findClientIp(body) {
  if (!body) return null;
  const m = body.match(LABELED_TOKEN); // a labeled IP (v4 or v6) is the safest signal
  if (m) {
    const tok = m[1].replace(/[.:]+$/, ''); // trim trailing punctuation
    if (V6_RE.test(tok) || V4_RE.test(tok)) return tok;
  }
  // Standalone fallback is IPv4-only (a bare IPv6 regex would match CSS like "::before").
  const all = body.match(STRICT_V4) || [];
  const isPrivate = (ip) => /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|255\.)/.test(ip);
  return all.find((ip) => !isPrivate(ip)) || all[0] || null;
}

/** Probe LM Studio + enumerate models. Never throws. On failure, returns full detail. */
export async function llmStatus(config) {
  const url = `${baseUrl(config)}/models`;
  try {
    const res = await fetchWithTimeout(url, { headers: authHeaders(config) }, 8000);
    if (!res.ok) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      // Cloudflare / WAF blocks often return an HTML page naming the IP to allow.
      const detectedIp = findClientIp(body);
      const isCloudflareAccess = /cloudflare access/i.test(body) || /\/cdn-cgi\/access\//i.test(body);
      return {
        reachable: true,
        models: [],
        loadedModel: null,
        error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
        detail: {
          url,
          status: res.status,
          statusText: res.statusText || '',
          contentType: res.headers.get('content-type') || '',
          server: res.headers.get('server') || '',
          cfRay: res.headers.get('cf-ray') || '',
          isCloudflareAccess,
          detectedIp,
          body: body.slice(0, 16000),
        },
      };
    }
    const data = await res.json();
    const all = (data.data || []).map((m) => ({ id: m.id, state: m.state || null, type: m.type || null }));
    // Only chat/completion-capable models — exclude embedding models (they can't
    // generate text, so summaries/triage/extraction would fail with them).
    const models = all.filter((m) => (m.type ? m.type !== 'embeddings' : !/embed/i.test(m.id)));
    const loaded = models.find((m) => m.state === 'loaded') || models[0] || null;
    return { reachable: true, models, loadedModel: loaded ? loaded.id : null };
  } catch (err) {
    return {
      reachable: false,
      models: [],
      loadedModel: null,
      error: err.name === 'AbortError' ? 'LM Studio not reachable (timeout)' : err.message,
      detail: { url, message: err.message, cause: err.cause ? String(err.cause) : '' },
    };
  }
}

/**
 * Non-streaming chat completion. Throws on HTTP errors (with .status set).
 */
export async function chatComplete(config, { messages, model, maxTokens = 220, temperature = 0.3, responseFormat } = {}) {
  const body = {
    model: model || config.llm?.model || '',
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
    // Discourage repetition loops that weak/quantized local models can fall into.
    frequency_penalty: 0.4,
    presence_penalty: 0.3,
  };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetchWithTimeout(
    `${baseUrl(config)}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
      body: JSON.stringify(body),
    },
    300000
  );

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      /* ignore */
    }
    const err = new Error(detail || `LM Studio returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message || {};
  let content = msg.content ?? '';
  // Reasoning models (e.g. Qwen3) may emit <think>…</think> in the content, or
  // separate it into reasoning_content. Strip the think block; fall back if empty.
  content = String(content).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!content && msg.reasoning_content) content = String(msg.reasoning_content).trim();
  return collapseRepetition(content);
}

/**
 * Collapse runaway repetition from a degenerating model (e.g. "they are they are
 * they are…") so it can never flood the UI. Collapses a 1-4 word phrase repeated
 * 3+ times in a row down to one, and caps total length.
 */
export function collapseRepetition(text) {
  if (!text) return text;
  let out = text.slice(0, 20000); // bound regex work on pathological output
  out = out.replace(/(\b[\w'’]+(?:\s+[\w'’]+){0,3})(?:\s+\1\b){2,}/gi, '$1');
  if (out.length > 6000) out = `${out.slice(0, 6000).trim()}…`;
  return out.trim();
}

/** Map LM Studio / network errors to a friendly message + HTTP status. */
export function describeLlmError(err) {
  if (err.status === 404) return { status: 503, message: 'No model is loaded in LM Studio. Load a model and try again.' };
  if (err.status === 503) return { status: 503, message: 'The model is still initializing. Try again in a moment.' };
  if (err.name === 'AbortError') return { status: 504, message: 'LM Studio timed out.' };
  return { status: 502, message: err.message || 'LM Studio request failed.' };
}
