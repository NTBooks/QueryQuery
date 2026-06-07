// Central path resolution for all persistent state. Loads .env so PERSIST_DIR
// is available to the server AND the scripts. Everything the app persists lives
// under PERSIST_DIR: the SQLite db, the config file, and the input/ folder.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// paths.js sits at the project root.
export const ROOT = path.dirname(fileURLToPath(import.meta.url));

const envDir = (process.env.PERSIST_DIR || '').trim();
export const PERSIST_DIR = envDir
  ? (path.isAbsolute(envDir) ? envDir : path.resolve(ROOT, envDir))
  : path.resolve(ROOT, 'persist');

export const DB_PATH = path.join(PERSIST_DIR, 'queryquery.db');
export const CONFIG_PATH = path.join(PERSIST_DIR, 'queryquery.config.json');
export const SAMPLES_DIR = path.join(ROOT, 'samples'); // dev artifacts stay in the repo

/** Resolve the input folder. Relative paths are relative to PERSIST_DIR. */
export function inputDir(config) {
  const f = (config && config.inputFolder) || './input';
  return path.isAbsolute(f) ? f : path.resolve(PERSIST_DIR, f);
}

export function ensurePersist() {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(path.join(PERSIST_DIR, 'input'), { recursive: true });
}

/**
 * One-time migration: if an older layout exists at the repo root (data/, config/,
 * input/) and the new persist locations are empty, copy the data over so existing
 * boards/settings aren't lost when upgrading to PERSIST_DIR.
 */
export function migrateLegacy() {
  ensurePersist();
  try {
    const oldDb = path.join(ROOT, 'data', 'queryquery.db');
    if (!fs.existsSync(DB_PATH) && fs.existsSync(oldDb)) {
      fs.copyFileSync(oldDb, DB_PATH);
      for (const ext of ['-wal', '-shm']) {
        if (fs.existsSync(oldDb + ext)) fs.copyFileSync(oldDb + ext, DB_PATH + ext);
      }
    }
    const oldConfig = path.join(ROOT, 'config', 'queryquery.config.json');
    if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(oldConfig)) {
      fs.copyFileSync(oldConfig, CONFIG_PATH);
    }
    const oldInput = path.join(ROOT, 'input');
    const newInput = path.join(PERSIST_DIR, 'input');
    if (fs.existsSync(oldInput) && path.resolve(oldInput) !== path.resolve(newInput)) {
      const existing = fs.readdirSync(newInput).filter((f) => f.toLowerCase().endsWith('.eml'));
      if (existing.length === 0) {
        for (const f of fs.readdirSync(oldInput)) {
          if (f.toLowerCase().endsWith('.eml')) fs.copyFileSync(path.join(oldInput, f), path.join(newInput, f));
        }
      }
    }
  } catch (err) {
    console.warn('  legacy migration skipped:', err.message);
  }
}
