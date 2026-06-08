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

/**
 * Resolve the base input folder. Relative paths are relative to PERSIST_DIR.
 * Containment: a (user-supplied) inputFolder must never escape PERSIST_DIR — an
 * absolute path elsewhere or `../` traversal falls back to the default <persist>/input,
 * so config can't be used to read/write/delete files outside the data sandbox.
 */
export function inputDir(config) {
  const base = path.resolve(PERSIST_DIR);
  const f = (config && config.inputFolder) || './input';
  const resolved = path.isAbsolute(f) ? path.resolve(f) : path.resolve(base, f);
  // path.relative normalizes separators/drive case; a contained path yields a
  // relative result that is neither absolute nor starts with "..".
  const rel = path.relative(base, resolved);
  const contained = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  return contained ? resolved : path.join(base, 'input');
}

function safeId(id) {
  const s = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!s) throw new Error('Invalid id');
  return s;
}

/** Per-user input subfolder: <PERSIST_DIR>/input/<userId> (each user has their own inbox). */
export function userInputDir(config, userId) {
  const dir = path.join(inputDir(config), safeId(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Per-user data folder: <PERSIST_DIR>/users/<userId> (proof tokens, etc.). */
export function userDataDir(userId) {
  const dir = path.join(PERSIST_DIR, 'users', safeId(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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
