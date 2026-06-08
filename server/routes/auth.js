// Auth: login, self-registration, current user, change own password.
import { Router } from 'express';
import repo from '../repo.js';
import { verifyPassword } from '../password.js';
import { authenticate, requireAuth, invalidateAuthCache } from '../auth.js';

const r = Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;

// Validate the Basic credentials the client just stored; return the profile.
r.post('/login', (req, res) => {
  const user = authenticate(req);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ user });
});

// Self-registration: pick a username + password.
r.post('/register', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2–32 chars (letters, numbers, . _ -).' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  if (repo.getUserByUsername(username)) return res.status(409).json({ error: 'That username is taken.' });
  const user = repo.createUser({ username, password, role: 'user' });
  res.status(201).json({ user });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Change own password (requires the current password).
r.post('/password', requireAuth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  const row = repo.getUserById(req.user.id);
  if (!row || !verifyPassword(currentPassword, row.pw_salt, row.pw_hash)) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  repo.setPassword(req.user.id, newPassword);
  invalidateAuthCache(); // old cached creds no longer valid
  res.json({ ok: true });
});

export default r;
