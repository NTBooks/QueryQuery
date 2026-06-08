import { Router } from 'express';
import { getConfig, configHash } from '../configStore.js';
import { ingestFolder, rescoreAll } from '../services/ingest.js';
import { bumpRevision } from '../services/revision.js';

const r = Router();

r.post('/', async (req, res) => {
  const config = getConfig();
  const hash = configHash(config);
  try {
    if (req.query.rescore === '1' || req.body?.rescore) {
      const out = rescoreAll(config, hash, req.user.id);
      bumpRevision();
      return res.json({ mode: 'rescore', ...out });
    }
    const out = await ingestFolder(config, hash, req.user.id);
    bumpRevision();
    res.json({ mode: 'scan', ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
