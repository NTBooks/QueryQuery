// Loads, merges, persists and hashes the scoring config.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_CONFIG } from '../shared/defaultConfig.js';
import { ROOT, PERSIST_DIR, CONFIG_PATH, inputDir, userInputDir, userDataDir, migrateLegacy } from '../paths.js';

// Re-export so existing `import { ROOT } from '../configStore.js'` callers keep working.
export { ROOT, PERSIST_DIR, CONFIG_PATH, inputDir, userInputDir, userDataDir };

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Deep-merge persisted config over defaults so new keys always exist. */
function mergeDefaults(cfg = {}) {
  const d = clone(DEFAULT_CONFIG);
  return {
    ...d,
    ...cfg,
    weights: { ...d.weights, ...(cfg.weights || {}) },
    genres: { ...d.genres, ...(cfg.genres || {}) },
    compRecencyYears: { ...d.compRecencyYears, ...(cfg.compRecencyYears || {}) },
    queryLength: { ...d.queryLength, ...(cfg.queryLength || {}) },
    aiSuspicion: {
      ...d.aiSuspicion,
      ...(cfg.aiSuspicion || {}),
      thresholds: { ...d.aiSuspicion.thresholds, ...((cfg.aiSuspicion || {}).thresholds || {}) },
    },
    aiDisclosure: { ...d.aiDisclosure, ...(cfg.aiDisclosure || {}) },
    llm: { ...d.llm, ...(cfg.llm || {}) },
    chainletter: { ...d.chainletter, ...(cfg.chainletter || {}) },
  };
}

export function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export function loadConfig() {
  migrateLegacy(); // bring forward any pre-PERSIST_DIR data on first run
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return mergeDefaults(JSON.parse(raw));
  } catch {
    const merged = clone(DEFAULT_CONFIG);
    saveConfig(merged);
    return merged;
  }
}

let current = null;
export function getConfig() {
  if (!current) current = loadConfig();
  return current;
}
export function setConfig(cfg) {
  current = mergeDefaults(cfg);
  saveConfig(current);
  return current;
}

// --- Stable hash of the scoring-relevant config (drives "stale score" UI) ---
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function configHash(cfg = getConfig()) {
  const subset = {
    wantedGenres: cfg.wantedGenres,
    wantedAuthors: cfg.wantedAuthors,
    wantedComps: cfg.wantedComps,
    keywordsWanted: cfg.keywordsWanted,
    keywordsAvoid: cfg.keywordsAvoid,
    genres: cfg.genres,
    compRecencyYears: cfg.compRecencyYears,
    queryLength: cfg.queryLength,
    weights: cfg.weights,
    scoreBands: cfg.scoreBands,
    aiPhraseBlocklist: cfg.aiPhraseBlocklist,
    clichePhrases: cfg.clichePhrases,
    aiSuspicion: cfg.aiSuspicion,
  };
  return crypto.createHash('sha1').update(stableStringify(subset)).digest('hex').slice(0, 12);
}
