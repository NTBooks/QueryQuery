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

/** Probe LM Studio + enumerate models. Never throws. */
export async function llmStatus(config) {
  const url = `${baseUrl(config)}/models`;
  try {
    const res = await fetchWithTimeout(url, { headers: authHeaders(config) }, 5000);
    if (!res.ok) {
      return { reachable: true, models: [], loadedModel: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const all = (data.data || []).map((m) => ({ id: m.id, state: m.state || null, type: m.type || null }));
    // Only chat/completion-capable models — exclude embedding models (they can't
    // generate text, so summaries/triage/extraction would fail with them).
    const models = all.filter((m) => (m.type ? m.type !== 'embeddings' : !/embed/i.test(m.id)));
    const loaded = models.find((m) => m.state === 'loaded') || models[0] || null;
    return { reachable: true, models, loadedModel: loaded ? loaded.id : null };
  } catch (err) {
    return { reachable: false, models: [], loadedModel: null, error: err.name === 'AbortError' ? 'LM Studio not reachable (timeout)' : err.message };
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
