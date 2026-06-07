// Tiny fetch wrapper for the QueryQuery JSON API, with per-call timeouts so a
// starved/blocked connection surfaces an error instead of hanging forever.
async function j(url, opts = {}) {
  const { timeoutMs = 20000, ...fetchOpts } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...fetchOpts, signal: ctrl.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. If other QueryQuery tabs are open, close them and refresh.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let debug;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (body?.debug) debug = body.debug;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.status = res.status;
    if (debug) err.debug = debug;
    throw err;
  }
  return res.json();
}

const jsonHeaders = { 'Content-Type': 'application/json' };
const LONG = 180000; // local LLM / blockchain calls can be slow

export const api = {
  meta: () => j('/api/meta'),
  getConfig: () => j('/api/config'),
  saveConfig: (config) => j('/api/config', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ config }) }),
  tickets: () => j('/api/tickets', { timeoutMs: 30000 }),
  revision: () => j('/api/revision', { timeoutMs: 8000 }),
  inbox: () => j('/api/inbox'),
  upload: (files) => j('/api/inbox/upload', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ files }), timeoutMs: 60000 }),
  analyze: (payload) => j('/api/analyze', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  createTicket: (payload) => j('/api/tickets', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  setStatus: (id, status) => j(`/api/tickets/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ status }) }),
  remove: (id) => j(`/api/tickets/${id}`, { method: 'DELETE' }),
  scan: () => j('/api/ingest', { method: 'POST', timeoutMs: 120000 }),
  rescore: () => j('/api/ingest?rescore=1', { method: 'POST', timeoutMs: 120000 }),
  llmStatus: () => j('/api/llm/status', { timeoutMs: 12000 }),
  summarize: (id, model) => j('/api/llm/summarize', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ id, model }), timeoutMs: LONG }),
  triage: (id, model) => j('/api/llm/triage', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ id, model }), timeoutMs: LONG }),
  extract: (payload) => j('/api/llm/extract', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload), timeoutMs: LONG }),
  chainletterTest: (draft) => j('/api/chainletter/test', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(draft || {}), timeoutMs: 30000 }),
  certify: (id) => j(`/api/tickets/${id}/certify`, { method: 'POST', headers: jsonHeaders, body: '{}', timeoutMs: LONG }),
};

export default api;
