// Admin-only user management: list users, reset a user's password.
import { Router } from 'express';
import repo from '../repo.js';
import { requireAuth, requireAdmin, invalidateAuthCache } from '../auth.js';
import { validatePassword } from '../passwordPolicy.js';

const r = Router();

r.use(requireAuth, requireAdmin);

r.get('/', (req, res) => {
  res.json({ users: repo.listUsers(), me: req.user.id });
});

r.post('/:id/reset-password', async (req, res) => {
  const newPassword = String(req.body?.newPassword || '');
  const target = repo.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const pw = validatePassword(newPassword, { username: target.username });
  if (!pw.ok) return res.status(400).json({ error: pw.error });
  await repo.setPassword(target.id, newPassword);
  invalidateAuthCache();
  res.json({ ok: true });
});

export default r;
