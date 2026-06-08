import { Router } from 'express';
import { getUserConfig, setUserConfig, configHash } from '../configStore.js';

const r = Router();

// Each user has their own scoring config ("what I'm looking for").
r.get('/', (req, res) => {
  const config = getUserConfig(req.user.id);
  res.json({ config, configHash: configHash(config) });
});

r.put('/', (req, res) => {
  const incoming = req.body?.config ?? req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid config payload' });
  }
  const saved = setUserConfig(req.user.id, incoming);
  res.json({ config: saved, configHash: configHash(saved) });
});

export default r;
