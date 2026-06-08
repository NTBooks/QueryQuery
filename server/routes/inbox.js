// Reports the input folder's absolute path and the .eml files currently in it,
// so the UI can tell the user exactly where to drop their query emails.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, userInputDir } from '../configStore.js';
import { ingestFolder } from '../services/ingest.js';
import { bumpRevision } from '../services/revision.js';

const r = Router();

const MAX_EML_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_FILES = 200; // cap a single drag-and-drop batch (the 25mb body limit bounds total size)

r.get('/', (req, res) => {
  const config = getConfig();
  const dir = userInputDir(config, req.user.id);
  let exists = false;
  let files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    exists = true;
    files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.eml'))
      .map((e) => {
        const st = fs.statSync(path.join(dir, e.name));
        return { name: e.name, size: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
  } catch {
    exists = false;
  }
  let archives = [];
  try {
    const archiveDir = path.join(dir, 'archive');
    archives = fs.readdirSync(archiveDir)
      .filter((f) => f.toLowerCase().endsWith('.zip'))
      .map((f) => {
        const st = fs.statSync(path.join(archiveDir, f));
        return { name: f, size: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
  } catch {
    archives = [];
  }

  res.json({ path: dir, exists, count: files.length, files, archives });
});

// Drag-and-drop upload: the browser sends each .eml's text; we write them into
// the input folder and ingest. (Plain text — no multipart, no binary handling.)
r.post('/upload', async (req, res) => {
  const config = getConfig();
  const dir = userInputDir(config, req.user.id);
  fs.mkdirSync(dir, { recursive: true });

  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!files.length) return res.status(400).json({ error: 'No files provided.' });
  if (files.length > MAX_UPLOAD_FILES) {
    return res.status(413).json({ error: `Too many files at once (max ${MAX_UPLOAD_FILES}). Upload in smaller batches.` });
  }

  let written = 0;
  const errors = [];
  for (const f of files) {
    try {
      const content = String(f.content ?? '');
      if (Buffer.byteLength(content, 'utf8') > MAX_EML_BYTES) {
        errors.push({ name: f.name, message: 'Too large — strip attachments before uploading.' });
        continue;
      }
      let name = path.basename(String(f.name || 'query.eml')).replace(/[^\w.\- ]/g, '_');
      if (!name.toLowerCase().endsWith('.eml')) name += '.eml';
      let dest = path.join(dir, name);
      if (fs.existsSync(dest)) {
        name = `${Date.now()}-${name}`;
        dest = path.join(dir, name);
      }
      fs.writeFileSync(dest, content, 'utf8');
      written += 1;
    } catch (err) {
      errors.push({ name: f.name, message: err.message });
    }
  }

  const summary = await ingestFolder(req.user.id);
  bumpRevision();
  res.json({ written, errors, ...summary });
});

export default r;
