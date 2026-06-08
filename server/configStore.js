// Loads, merges, persists and hashes the scoring config.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_CONFIG } from '../shared/defaultConfig.js';
import { ROOT, PERSIST_DIR, CONFIG_PATH, inputDir, userInputDir, userDataDir, migrateLegacy } from '../paths.js';
import repo from './repo.js';

// Re-export so existing `import { ROOT } from '../configStore.js'` callers keep working.
export { ROOT, PERSIST_DIR, CONFIG_PATH, inputDir, userInputDir, userDataDir };

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Deep-merge persisted config over defaults so new keys always exist. */
function mergeDefaults(cfg = {}) {
  const d = clone(DEFAULT_CONFIG);
  const merged = {
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
  // One-time label rename: the lowest band used to be "Likely Reject".
  if (Array.isArray(merged.scoreBands)) {
    merged.scoreBands = merged.scoreBands.map((b) =>
      b && b.key === 'likely_reject' && b.label === 'Likely Reject' ? { ...b, label: 'Lowest Match' } : b
    );
  }
  return merged;
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

// --- Named scoring profiles -------------------------------------------------
// Each user has a set of named profiles and one active profile. The active
// profile IS "this user's scoring config" (what getUserConfig returns). Stored as
// JSON in users.profiles: { active, profiles: { name -> config } }.

const MAX_PROFILES = 50;
const DEFAULT_PROFILE = 'Default';

/** A scoring config with the global-only llm block stripped (profiles never carry it). */
function scoringOnly(cfg) {
  const c = clone(cfg || {});
  delete c.llm;
  delete c.inputFolder; // filesystem path, not a scoring knob (path-traversal guard)
  return c;
}

/**
 * Read (and lazily create) a user's profiles bundle. On first access it seeds a
 * single "Default" profile from the legacy users.config column, or the global
 * config, preserving today's behavior — then persists it once.
 */
function readProfiles(userId) {
  const u = repo.getUserById(userId);
  if (!u) return { active: DEFAULT_PROFILE, profiles: { [DEFAULT_PROFILE]: scoringOnly(getConfig()) } };
  if (u.profiles) {
    try {
      const d = JSON.parse(u.profiles);
      if (d && d.profiles && typeof d.profiles === 'object' && Object.keys(d.profiles).length) {
        if (!d.profiles[d.active]) d.active = Object.keys(d.profiles)[0];
        return d;
      }
    } catch {
      /* fall through to (re)seed */
    }
  }
  let legacy = null;
  if (u.config) {
    try { legacy = JSON.parse(u.config); } catch { /* ignore */ }
  }
  const data = { active: DEFAULT_PROFILE, profiles: { [DEFAULT_PROFILE]: scoringOnly(legacy || getConfig()) } };
  repo.setUserProfiles(userId, JSON.stringify(data));
  return data;
}

function activeConfig(data) {
  const merged = mergeDefaults(data.profiles[data.active] || {});
  merged.llm = getConfig().llm; // LLM is global/admin-managed
  return merged;
}

/** This user's scoring config = their active profile (with the global LLM spliced in). */
export function getUserConfig(userId) {
  return activeConfig(readProfiles(userId));
}

/** Save the user's draft into the ACTIVE profile (used by the plain config save). */
export function setUserConfig(userId, cfg) {
  const data = readProfiles(userId);
  data.profiles[data.active] = scoringOnly(mergeDefaults(cfg || {}));
  repo.setUserProfiles(userId, JSON.stringify(data));
  return activeConfig(data);
}

/** { profiles: [names], active } */
export function listProfiles(userId) {
  const data = readProfiles(userId);
  return { profiles: Object.keys(data.profiles), active: data.active };
}

/** Make an existing profile active; returns its config. */
export function selectProfile(userId, name) {
  const data = readProfiles(userId);
  if (!Object.prototype.hasOwnProperty.call(data.profiles, name)) throw new Error('Profile not found.');
  data.active = name;
  repo.setUserProfiles(userId, JSON.stringify(data));
  return activeConfig(data);
}

/** Create or overwrite a named profile from a draft config, and make it active. */
export function saveProfile(userId, name, cfg) {
  const data = readProfiles(userId);
  const isNew = !Object.prototype.hasOwnProperty.call(data.profiles, name);
  if (isNew && Object.keys(data.profiles).length >= MAX_PROFILES) {
    throw new Error(`Profile limit reached (${MAX_PROFILES}). Delete one first.`);
  }
  data.profiles[name] = scoringOnly(mergeDefaults(cfg || {}));
  data.active = name;
  repo.setUserProfiles(userId, JSON.stringify(data));
  return activeConfig(data);
}

/** Delete a named profile (never the last one); returns the new active config. */
export function deleteProfile(userId, name) {
  const data = readProfiles(userId);
  if (!Object.prototype.hasOwnProperty.call(data.profiles, name)) throw new Error('Profile not found.');
  if (Object.keys(data.profiles).length <= 1) throw new Error('Cannot delete the only profile.');
  delete data.profiles[name];
  if (data.active === name) data.active = Object.keys(data.profiles)[0];
  repo.setUserProfiles(userId, JSON.stringify(data));
  return activeConfig(data);
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
