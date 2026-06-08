import { Router } from 'express';
import {
  getUserConfig, setUserConfig, configHash,
  listProfiles, selectProfile, saveProfile, deleteProfile,
} from '../configStore.js';
import { rescoreAll } from '../services/ingest.js';
import { bumpRevision } from '../services/revision.js';

const r = Router();

const cleanName = (s) => String(s || '').trim();
const NAME_RE = /^.{1,40}$/;

function configPayload(req, extra = {}) {
  const config = getUserConfig(req.user.id);
  const { profiles, active } = listProfiles(req.user.id);
  return { config, configHash: configHash(config), profiles, activeProfile: active, ...extra };
}

// Each user has their own scoring config ("what I'm looking for"), selected from
// their named profiles. The active profile is the source of truth.
r.get('/', (req, res) => res.json(configPayload(req)));

// Save the current draft into the active profile (no rescore — callers re-score
// explicitly, e.g. the board's Re-score button or a profile op below).
r.put('/', (req, res) => {
  const incoming = req.body?.config ?? req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid config payload' });
  }
  setUserConfig(req.user.id, incoming);
  res.json(configPayload(req));
});

// --- Named profiles. select / save / delete each rescore the whole board. ---

// Run a profile mutation, then re-score the user's tickets against the new active config.
function mutateAndRescore(req, res, mutate) {
  try {
    mutate();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const out = rescoreAll(req.user.id);
  bumpRevision();
  return res.json(configPayload(req, { rescored: out.rescored }));
}

r.post('/profiles/select', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Profile name required.' });
  mutateAndRescore(req, res, () => selectProfile(req.user.id, name));
});

r.post('/profiles/save', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!NAME_RE.test(name)) return res.status(400).json({ error: 'Profile name must be 1–40 characters.' });
  const cfg = req.body?.config;
  if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: 'Invalid config payload.' });
  mutateAndRescore(req, res, () => saveProfile(req.user.id, name, cfg));
});

r.delete('/profiles/:name', (req, res) => {
  const name = cleanName(req.params.name);
  mutateAndRescore(req, res, () => deleteProfile(req.user.id, name));
});

export default r;
