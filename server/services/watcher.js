// Watches the input folder and auto-ingests new/changed .eml files (debounced),
// then notifies open browsers via SSE. No mailbox access, no credentials — it
// only ever sees files the user deliberately puts in the folder.
import fs from 'node:fs';
import { getConfig, configHash, inputDir } from '../configStore.js';
import { ingestFolder } from './ingest.js';
import { bumpRevision } from './revision.js';
import repo from '../repo.js';

let watcher = null;
let timer = null;
let running = false;

export function getInputDir() {
  return inputDir(getConfig());
}

async function runIngest() {
  if (running) {
    // Coalesce: re-run once more after the current pass finishes.
    clearTimeout(timer);
    timer = setTimeout(runIngest, 800);
    return;
  }
  running = true;
  try {
    const config = getConfig();
    const hash = configHash(config);
    // Each user has their own input subfolder; re-ingest every user's folder.
    let changed = 0;
    for (const u of repo.listUsers()) {
      const s = await ingestFolder(config, hash, u.id);
      changed += (s.added || 0) + (s.updated || 0);
    }
    if (changed > 0) bumpRevision();
  } catch (err) {
    console.warn('  auto-ingest failed:', err.message);
  } finally {
    running = false;
  }
}

function onChange(event, filename) {
  if (filename) {
    const f = String(filename).toLowerCase();
    if (!f.endsWith('.eml') || f.includes('archive')) return;
  }
  clearTimeout(timer);
  timer = setTimeout(runIngest, 800);
}

export function startWatcher() {
  const dir = getInputDir();
  fs.mkdirSync(dir, { recursive: true });
  try {
    // Recursive watch covers per-user subfolders. Not supported on Linux — fall
    // back to a top-level watch there (uploads/Scan still ingest immediately).
    try {
      watcher = fs.watch(dir, { recursive: true }, onChange);
    } catch {
      watcher = fs.watch(dir, onChange);
      console.log('  (recursive watch unavailable — auto-ingest covers new subfolders on Scan/upload)');
    }
    console.log('  Watching input folders — dropped .eml files are scored automatically.');
  } catch (err) {
    console.warn('  Could not watch input folder (use Scan Inbox instead):', err.message);
  }
  return watcher;
}
