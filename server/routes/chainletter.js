// Per-user Chainletter settings + connectivity test. The token URL, cached claim
// and JWT all live on the user's row (Chainletter API key is per user).
import { Router } from 'express';
import repo from '../repo.js';
import { testConnection } from '../services/chainletter.js';

const r = Router();

const VERIFY_TEMPLATE = 'https://{server}/verify/{cid}';

/** Build the per-user chainletter store (optionally with a claim persister). */
function userCl(userId, withSaver = false) {
  const u = repo.getUserById(userId);
  const cl = {
    tokenUrl: u?.cl_token_url || '',
    enabled: !!u?.cl_enabled,
    claim: u?.cl_claim ? JSON.parse(u.cl_claim) : null,
    verifyUrlTemplate: VERIFY_TEMPLATE,
  };
  if (withSaver) cl.saveClaim = (fresh) => repo.setUserClaim(userId, fresh);
  return cl;
}

// Current user's settings (never returns the JWT/claim secrets).
r.get('/', (req, res) => {
  const u = repo.getUserById(req.user.id);
  res.json({ enabled: !!u?.cl_enabled, tokenUrl: u?.cl_token_url || '', claimed: !!u?.cl_claim });
});

// Save current user's settings (drops the cached claim if the token URL changed).
r.put('/', (req, res) => {
  const tokenUrl = String(req.body?.tokenUrl || '').trim();
  const enabled = !!req.body?.enabled;
  const u = repo.getUserById(req.user.id);
  const prevClaim = u?.cl_claim ? JSON.parse(u.cl_claim) : null;
  const keepClaim = prevClaim && prevClaim.tokenUrl === tokenUrl ? prevClaim : null;
  repo.setUserChainletter(req.user.id, { tokenUrl, enabled, claim: keepClaim });
  res.json({ enabled, tokenUrl, claimed: !!keepClaim });
});

// Test connectivity (claims + caches to the user's row).
r.post('/test', async (req, res) => {
  res.json(await testConnection(userCl(req.user.id, true)));
});

export default r;
