import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import repo from '../repo.js';
import { STATUS_KEYS } from '../../shared/constants.js';
import { getConfig, configHash, inputDir } from '../configStore.js';
import { analyze } from '../services/ingest.js';
import { certifyBytes, guessMime, resolveCredentials } from '../services/chainletter.js';

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
      'We have stored your original letter privately and stamped it to the blockchain so you can prove your idea ' +
      'was submitted and presented to a human. Your letter was not shared publicly.\n\n' +
      `Verify your submission: ${cert.verifyUrl}\n\n` +
      'Thank you for querying.',
  };
}

r.get('/', (req, res) => {
  res.json({ tickets: repo.getAll(), configHash: configHash() });
});

// Create a ticket from pasted text (analyze + persist).
r.post('/', (req, res) => {
  const { text, subject = '', fromName = '', fromAddr = '' } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Provide letter text.' });
  }
  const config = getConfig();
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
    status: 'did_not_review',
    now,
  });
  res.status(201).json(repo.getById(Number(info.lastInsertRowid)));
});

r.get('/:id', (req, res) => {
  const t = repo.getById(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  res.json(t);
});

r.patch('/:id', (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_KEYS.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Expected one of: ${STATUS_KEYS.join(', ')}` });
  }
  const t = repo.getRawById(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  repo.setStatus(t.id, status, new Date().toISOString());
  res.json(repo.getById(t.id));
});

r.delete('/:id', (req, res) => {
  repo.remove(Number(req.params.id));
  res.json({ ok: true });
});

// Certify Receipt: stamp a hash of the original letter to the blockchain (no upload).
r.post('/:id/certify', async (req, res) => {
  const config = getConfig();
  const clConfig = config.chainletter || {};
  if (!clConfig.enabled) return res.status(400).json({ error: 'Chainletter certification is disabled. Enable it in the Chainletter tab.' });
  if (!clConfig.tokenUrl) return res.status(400).json({ error: 'No Chainletter token URL configured.' });

  const raw = repo.getRawById(Number(req.params.id));
  if (!raw) return res.status(404).json({ error: 'Ticket not found' });

  // Hash the ORIGINAL email bytes (the .eml on disk); fall back to the stored body.
  const dir = inputDir(config);
  const file = path.join(dir, raw.source_file || '');
  let buffer;
  let name = raw.source_file || `ticket-${raw.id}.eml`;
  try {
    if (raw.source_file && fs.existsSync(file)) {
      buffer = fs.readFileSync(file);
    } else if (raw.source_file && raw.archive_zip) {
      // The original was archived into a per-batch zip — read the exact bytes back.
      const zipPath = path.join(dir, 'archive', raw.archive_zip);
      if (fs.existsSync(zipPath)) {
        try {
          buffer = new AdmZip(zipPath).readFile(raw.source_file) || undefined;
        } catch {
          /* fall through to body */
        }
      }
    }
    if (!buffer || !buffer.length) {
      buffer = Buffer.from(raw.body || '', 'utf8');
      if (!/\.\w+$/.test(name)) name = `ticket-${raw.id}.txt`;
    }
  } catch (e) {
    return res.status(500).json({ error: `Could not read the original letter: ${e.message}` });
  }
  if (!buffer || !buffer.length) return res.status(400).json({ error: 'The original letter is empty.' });

  let cl;
  try {
    cl = await resolveCredentials(config);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // eslint-disable-next-line no-console
  console.log(`[chainletter] certify ticket ${raw.id} "${name}" (${buffer.length}B) via ${cl.webhookUrl} group=${cl.groupId || '∅'}`);

  try {
    const cert = await certifyBytes(cl, { buffer, name, mimetype: guessMime(name) });
    const now = new Date().toISOString();
    const parsed = repo.getById(raw.id);
    const reply = buildReply(parsed, cert);
    const result = {
      stamp: cert.stamp,
      verifyUrl: cert.verifyUrl,
      alreadyExists: cert.alreadyExists,
      name,
      size: buffer.length,
      mimetype: guessMime(name),
      at: now,
      reply,
    };
    repo.setCertification(raw.id, cert.hash, JSON.stringify(result), now);
    res.json({ id: raw.id, cid: cert.hash, stamp: cert.stamp, verifyUrl: cert.verifyUrl, alreadyExists: cert.alreadyExists, reply, ticket: repo.getById(raw.id) });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    const debug = {
      endpoint: err.endpoint || cl.webhookUrl,
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
