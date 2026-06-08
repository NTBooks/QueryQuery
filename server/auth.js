// HTTP Basic auth middleware. The SPA stores base64(user:pass) and sends it on
// every request; we verify against the users table. A short-lived in-memory cache
// avoids re-running scrypt on rapid polls.
import { verifyPassword } from './password.js';
import repo from './repo.js';

const cache = new Map(); // base64creds -> { user, exp }
const TTL_MS = 5 * 60 * 1000;

/** Returns {id, username, role} for valid Basic credentials, else null. */
export function authenticate(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return null;
  const b64 = header.slice(6).trim();

  const hit = cache.get(b64);
  if (hit && hit.exp > Date.now()) return hit.user;

  let decoded;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  const username = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  const row = repo.getUserByUsername(username);
  if (!row || !verifyPassword(password, row.pw_salt, row.pw_hash)) return null;

  const user = { id: row.id, username: row.username, role: row.role };
  cache.set(b64, { user, exp: Date.now() + TTL_MS });
  return user;
}

/** Require a valid user; attaches req.user. No WWW-Authenticate header (the SPA shows its own login). */
export function requireAuth(req, res, next) {
  const user = authenticate(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

/** Clear the credential cache (call after any password change). */
export function invalidateAuthCache() {
  cache.clear();
}
