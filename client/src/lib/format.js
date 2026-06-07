// Display helpers shared across components.

export const BAND_COLOR = {
  top: 'green',
  strong: 'teal',
  mixed: 'yellow',
  weak: 'orange',
  likely_reject: 'red',
};

export const STATUS_COLOR = {
  did_not_review: 'gray',
  reject: 'red',
  second_look: 'purple',
  accept: 'green',
  hold: 'blue',
};

export function bandColor(key) {
  return BAND_COLOR[key] || 'gray';
}

export function scoreColor(score) {
  if (score >= 85) return 'green';
  if (score >= 70) return 'teal';
  if (score >= 55) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

export function genreLabel(meta, key) {
  if (!key) return null;
  const g = (meta?.genres || []).find((x) => x.key === key);
  return g ? g.label : key;
}

export function flagLabel(meta, key) {
  return meta?.flagLabels?.[key] || key;
}

export function metricLabel(meta, key) {
  return meta?.metricLabels?.[key] || key;
}

export function fmtWords(n) {
  if (n == null) return null;
  if (n >= 1000) return `${Math.round(n / 1000)}k words`;
  return `${n} words`;
}

// Flags that are "negative" (problems) vs informational/positive.
const POSITIVE_FLAGS = new Set(['wanted_keyword']);
export function flagColor(key) {
  if (POSITIVE_FLAGS.has(key)) return 'green';
  if (key === 'ai_disclosed') return 'purple';
  return 'red';
}
