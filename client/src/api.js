// Tiny fetch wrapper for the QueryQuery JSON API. Sends HTTP Basic auth from the
// stored credentials, and signals a global logout on 401.
const AUTH_KEY = 'qq_auth';
let onUnauthorized = null;

export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}
export function setAuth(b64) {
  if (b64) localStorage.setItem(AUTH_KEY, b64);
  else localStorage.removeItem(AUTH_KEY);
}
export function getAuth() {
  return localStorage.getItem(AUTH_KEY);
}
// base64 of the UTF-8 bytes (so the server can decode non-ASCII passwords).
function basic(username, password) {
  return btoa(unescape(encodeURIComponent(`${username}:${password}`)));
}
function authHeader() {
  const a = getAuth();
  return a ? { Authorization: `Basic ${a}` } : {};
}

async function j(url, opts = {}) {
  const { timeoutMs = 20000, headers, ...fetchOpts } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...fetchOpts, headers: { ...authHeader(), ...headers }, signal: ctrl.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. If other QueryQuery tabs are open, close them and refresh.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && !url.endsWith('/auth/login')) {
    setAuth(null);
    if (onUnauthorized) onUnauthorized();
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
  // --- auth / accounts ---
  login: async (username, password) => {
    setAuth(basic(username, password));
    try {
      const { user } = await j('/api/auth/login', { method: 'POST' });
      return user;
    } catch (err) {
      setAuth(null);
      throw err;
    }
  },
  register: async (username, password) => {
    const { user } = await j('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ username, password }) });
    setAuth(basic(username, password));
    return user;
  },
  me: () => j('/api/auth/me', { timeoutMs: 8000 }),
  logout: () => setAuth(null),
  changePassword: (currentPassword, newPassword) =>
    j('/api/auth/password', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ currentPassword, newPassword }) }),
  listUsers: () => j('/api/users'),
  resetPassword: (id, newPassword) =>
    j(`/api/users/${id}/reset-password`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ newPassword }) }),

  // --- app ---
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
  archiveBoard: (comment) => j('/api/tickets/archive', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ comment }) }),
  listArchives: () => j('/api/tickets/archives'),
  restoreArchive: (iter) => j(`/api/tickets/archives/${iter}/restore`, { method: 'POST' }),
  llmStatus: () => j('/api/llm/status', { timeoutMs: 12000 }),
  summarize: (id, model) => j('/api/llm/summarize', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ id, model }), timeoutMs: LONG }),
  triage: (id, model) => j('/api/llm/triage', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ id, model }), timeoutMs: LONG }),
  extract: (payload) => j('/api/llm/extract', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload), timeoutMs: LONG }),
  certify: (id) => j(`/api/tickets/${id}/certify`, { method: 'POST', headers: jsonHeaders, body: '{}', timeoutMs: LONG }),
  // --- per-user chainletter ---
  getChainletter: () => j('/api/chainletter'),
  saveChainletter: (cl) => j('/api/chainletter', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(cl) }),
  chainletterTest: () => j('/api/chainletter/test', { method: 'POST', headers: jsonHeaders, body: '{}', timeoutMs: 30000 }),
};

export default api;
