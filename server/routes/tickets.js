import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import repo from '../repo.js';
import { STATUS_KEYS } from '../../shared/constants.js';
import { getUserConfig, configHash, userDataDir } from '../configStore.js';
import { analyze } from '../services/ingest.js';
import { certifyText, resolveCredentials, redactUrl } from '../services/chainletter.js';
import { bumpRevision } from '../services/revision.js';

const r = Router();

// Human-readable outcome phrases for the copy-paste reply.
const STATUS_REPLY = {
  did_not_review: 'received and logged for review',
  reject: 'not selected for representation at this time',
  second_look: 'flagged for a closer second look',
  accept: 'advanced for further consideration',
  hold: 'placed on hold',
};

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

function buildReply(t, cert) {
  const statusPhrase = STATUS_REPLY[t.status] || 'reviewed';
  const title = t.components?.metadata?.title || '';
  const greeting = t.from_name ? `Dear ${t.from_name},` : 'Hello,';
  // Prefer the parsed sender; fall back to the first email found in the letter.
  const to = t.from_addr || (String(t.body || '').match(EMAIL_RE) || [''])[0] || '';
  return {
    to,
    subject: `Re: ${t.subject || 'Your query'}`,
    body:
      `${greeting}\n\n` +
      `Your query${title ? ` for "${title}"` : ''} was reviewed and ${statusPhrase}. ` +
      'We have stamped a fingerprint of your original letter to the blockchain so you can prove your idea ' +
      'was submitted and presented to a human.\n\n' +
      `Verify your submission: ${cert.verifyUrl}\n\n` +
      'PROOF TOKEN — keep this. It is the exact (base64-encoded) data we stamped. Anyone can recompute its\n' +
      'hash and check the blockchain to confirm your letter existed when you submitted it:\n\n' +
      `${cert.stampData}\n\n` +
      'Thank you for querying.',
  };
}

r.get('/', (req, res) => {
  res.json({ tickets: repo.getAllByOwner(req.user.id), configHash: configHash(getUserConfig(req.user.id)) });
});

// Create a ticket from pasted text (analyze + persist).
r.post('/', (req, res) => {
  const { text, subject = '', fromName = '', fromAddr = '' } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Provide letter text.' });
  }
  const config = getUserConfig(req.user.id);
  const hash = configHash(config);
  const a = analyze(String(text), String(subject), config);
  const now = new Date().toISOString();
  const source_file = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const info = repo.insert({
    source_file,
    from_addr: fromAddr,
    from_name: fromName,
    subject,
    received_at: now,
    body: String(text),
    components: JSON.stringify(a.components),
    score: a.score,
    score_band: a.band,
    breakdown: JSON.stringify(a.breakdown),
    ai_suspicion: a.ai.aiSuspicion,
    ai_disclosed: a.ai.aiDisclosed ? 1 : 0,
    cliche_score: a.ai.clicheScore,
    config_hash: hash,
    owner_id: req.user.id,
    status: 'did_not_review',
    now,
  });
  res.status(201).json(repo.getById(Number(info.lastInsertRowid)));
});

// --- board archiving (these MUST precede the /:id routes) ---
r.post('/archive', (req, res) => {
  // Optional status filter (e.g. archive only 'reject' cards); otherwise archive all.
  const status = STATUS_KEYS.includes(req.body?.status) ? req.body.status : null;
  const out = repo.archiveBoard(req.user.id, String(req.body?.comment || ''), status);
  bumpRevision();
  res.json(out);
});

r.get('/archives', (req, res) => {
  res.json({ archives: repo.listArchives(req.user.id) });
});

r.post('/archives/:iter/restore', (req, res) => {
  const restored = repo.restoreArchive(req.user.id, Number(req.params.iter));
  bumpRevision();
  res.json({ restored });
});

r.get('/:id', (req, res) => {
  const t = repo.getByIdOwned(Number(req.params.id), req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  res.json(t);
});

r.patch('/:id', (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_KEYS.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Expected one of: ${STATUS_KEYS.join(', ')}` });
  }
  const t = repo.getRawByIdOwned(Number(req.params.id), req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  repo.setStatus(t.id, status, new Date().toISOString());
  res.json(repo.getById(t.id));
});

r.delete('/:id', (req, res) => {
  const t = repo.getRawByIdOwned(Number(req.params.id), req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  repo.remove(t.id);
  res.json({ ok: true });
});

// Certify Receipt: stamp a hash of the original letter to the blockchain (no upload).
r.post('/:id/certify', async (req, res) => {
  // Chainletter is per-user (token + cached claim live on the user's row).
  const u = repo.getUserById(req.user.id);
  if (!u?.cl_enabled) return res.status(400).json({ error: 'Chainletter certification is disabled. Enable it in the Chainletter tab.' });
  if (!u?.cl_token_url) return res.status(400).json({ error: 'No Chainletter token URL configured (Chainletter tab).' });

  const raw = repo.getRawByIdOwned(Number(req.params.id), req.user.id);
  if (!raw) return res.status(404).json({ error: 'Ticket not found' });

  // Stamp the query TEXT (base64) — no original-file storage needed.
  const text = String(raw.body || '');
  if (!text.trim()) return res.status(400).json({ error: 'This letter has no text to certify.' });

  let cl;
  try {
    cl = await resolveCredentials({
      tokenUrl: u.cl_token_url,
      claim: u.cl_claim ? JSON.parse(u.cl_claim) : null,
      verifyUrlTemplate: 'https://{server}/verify/{cid}',
      saveClaim: (fresh) => repo.setUserClaim(req.user.id, fresh),
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // eslint-disable-next-line no-console
  console.log(`[chainletter] certify ticket ${raw.id} (text ${text.length} chars) via ${redactUrl(cl.webhookUrl)} group=${cl.groupId || '∅'}`);

  try {
    const cert = await certifyText(cl, { text, name: `query-${raw.id}` });
    const now = new Date().toISOString();
    const parsed = repo.getById(raw.id);
    const reply = buildReply(parsed, cert);
    const result = {
      stamp: cert.stamp,
      verifyUrl: cert.verifyUrl,
      stampData: cert.stampData,
      network: cert.network,
      at: now,
      reply,
    };
    repo.setCertification(raw.id, cert.hash, JSON.stringify(result), now);
    // Keep a copy of the proof token in the user's folder (so it survives outside the DB).
    try {
      const proofsDir = path.join(userDataDir(req.user.id), 'proofs');
      fs.mkdirSync(proofsDir, { recursive: true });
      fs.writeFileSync(path.join(proofsDir, `${cert.hash}.txt`), cert.stampData, 'utf8');
    } catch {
      /* best-effort */
    }
    res.json({ id: raw.id, cid: cert.hash, stamp: cert.stamp, verifyUrl: cert.verifyUrl, stampData: cert.stampData, reply, ticket: repo.getById(raw.id) });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    const debug = {
      endpoint: redactUrl(err.endpoint || cl.webhookUrl),
      method: err.method || null,
      status: err.status || null,
      detail: err.detail || null,
      groupId: err.groupId || cl.groupId,
      authMode: err.authMode || null,
    };
    // eslint-disable-next-line no-console
    console.error(`[chainletter] certify FAILED ticket ${raw.id}: ${err.message} [${debug.method || '?'} ${debug.endpoint} group=${debug.groupId || '∅'} auth=${debug.authMode || '?'}]`);
    res.status(status).json({ error: err.message, debug });
  }
});

export default r;
