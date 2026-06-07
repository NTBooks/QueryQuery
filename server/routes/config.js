import { Router } from 'express';
import { getConfig, setConfig, configHash } from '../configStore.js';

const r = Router();

r.get('/', (req, res) => {
  const config = getConfig();
  res.json({ config, configHash: configHash(config) });
});

r.put('/', (req, res) => {
  const incoming = req.body?.config ?? req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid config payload' });
  }
  const saved = setConfig(incoming);
  res.json({ config: saved, configHash: configHash(saved) });
});

export default r;
