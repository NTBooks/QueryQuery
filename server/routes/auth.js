// Auth: login, self-registration, current user, change own password.
import { Router } from 'express';
import repo from '../repo.js';
import { verifyPassword } from '../password.js';
import { authenticate, requireAuth, invalidateAuthCache } from '../auth.js';
import { registrationOpen } from '../featureFlags.js';
import { rateLimit } from '../rateLimit.js';
import { validatePassword } from '../passwordPolicy.js';

const r = Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;

// Throttle credential-guessing and scripted signups, per client IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this network. Try again later.',
});

// Lets the login screen show/hide the "Register" option. Public.
r.get('/registration', (req, res) => res.json({ open: registrationOpen() }));

// Validate the Basic credentials the client just stored; return the profile.
r.post('/login', loginLimiter, async (req, res) => {
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ user });
});

// Self-registration: pick a username + password (disabled by default in production).
r.post('/register', registerLimiter, async (req, res) => {
  if (!registrationOpen()) {
    return res.status(403).json({ error: 'Registration is disabled on this server. Ask an administrator to create your account.' });
  }
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2–32 chars (letters, numbers, . _ -).' });
  }
  const pw = validatePassword(password, { username });
  if (!pw.ok) return res.status(400).json({ error: pw.error });
  if (repo.getUserByUsername(username)) return res.status(409).json({ error: 'That username is taken.' });
  const user = await repo.createUser({ username, password, role: 'user' });
  res.status(201).json({ user });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Change own password (requires the current password).
r.post('/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const pw = validatePassword(newPassword, { username: req.user.username });
  if (!pw.ok) return res.status(400).json({ error: pw.error });
  const row = repo.getUserById(req.user.id);
  if (!row || !(await verifyPassword(currentPassword, row.pw_salt, row.pw_hash))) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  await repo.setPassword(req.user.id, newPassword);
  invalidateAuthCache(); // old cached creds no longer valid
  res.json({ ok: true });
});

export default r;
