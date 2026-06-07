// Watches the input folder and auto-ingests new/changed .eml files (debounced),
// then notifies open browsers via SSE. No mailbox access, no credentials — it
// only ever sees files the user deliberately puts in the folder.
import fs from 'node:fs';
import { getConfig, configHash, inputDir } from '../configStore.js';
import { ingestFolder } from './ingest.js';
import { bumpRevision } from './revision.js';

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
    const summary = await ingestFolder(config, configHash(config));
    if ((summary.added || 0) + (summary.updated || 0) > 0) {
      bumpRevision();
    }
  } catch (err) {
    console.warn('  auto-ingest failed:', err.message);
  } finally {
    running = false;
  }
}

export function startWatcher() {
  const dir = getInputDir();
  fs.mkdirSync(dir, { recursive: true });
  try {
    watcher = fs.watch(dir, (event, filename) => {
      if (filename && !String(filename).toLowerCase().endsWith('.eml')) return;
      clearTimeout(timer);
      timer = setTimeout(runIngest, 800);
    });
    console.log('  Watching input folder — dropped .eml files are scored automatically.');
  } catch (err) {
    console.warn('  Could not watch input folder (use Scan Inbox instead):', err.message);
  }
  return watcher;
}
