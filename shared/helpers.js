// Pure helpers shared by server, scripts, and client (no Node-only deps).
import { DEFAULT_SCORE_BANDS } from './constants.js';

/** Clamp n into [lo, hi]. */
export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Return the score band whose [min,max] contains `score`. */
export function bandForScore(score, bands = DEFAULT_SCORE_BANDS) {
  const s = clamp(Math.round(score), 0, 100);
  const hit = bands.find((b) => s >= b.min && s <= b.max);
  return hit || bands[bands.length - 1];
}

/**
 * Normalize a weights object so its values sum to 100 (preserving ratios).
 * Returns a new object. If all weights are 0, returns them unchanged.
 */
export function normalizeWeights(weights) {
  const entries = Object.entries(weights || {});
  const total = entries.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
  if (total <= 0) return { ...weights };
  return Object.fromEntries(entries.map(([k, v]) => [k, ((Number(v) || 0) / total) * 100]));
}
