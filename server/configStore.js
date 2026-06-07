// Loads, merges, persists and hashes the scoring config.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_CONFIG } from '../shared/defaultConfig.js';
import { ROOT, PERSIST_DIR, CONFIG_PATH, inputDir, migrateLegacy } from '../paths.js';

// Re-export so existing `import { ROOT } from '../configStore.js'` callers keep working.
export { ROOT, PERSIST_DIR, CONFIG_PATH, inputDir };

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
  const prevCl = (current || loadConfig()).chainletter || {};
  const merged = mergeDefaults(cfg);
  // The Chainletter `claim` cache is server-managed (not a UI field). Preserve it
  // across UI saves while the token URL is unchanged; drop it if the token changed.
  if (merged.chainletter) {
    if (merged.chainletter.tokenUrl !== prevCl.tokenUrl) {
      delete merged.chainletter.claim;
    } else if (!merged.chainletter.claim && prevCl.claim) {
      merged.chainletter.claim = prevCl.claim;
    }
  }
  current = merged;
  saveConfig(current);
  return current;
}

/** Persist the single-use Chainletter claim (webhookurl/jwt/groupname/tenant/expires). */
export function cacheChainletterClaim(claim) {
  const cfg = current || loadConfig();
  cfg.chainletter = { ...(cfg.chainletter || {}), claim };
  current = cfg;
  saveConfig(cfg);
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
