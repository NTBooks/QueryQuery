// Chainletter connectivity test. Claiming is single-use, so the panel saves the
// token URL first, then tests against the SAVED config (no draft credentials).
import { Router } from 'express';
import { getConfig } from '../configStore.js';
import { testConnection } from '../services/chainletter.js';

const r = Router();

r.post('/test', async (req, res) => {
  res.json(await testConnection(getConfig()));
});

export default r;
