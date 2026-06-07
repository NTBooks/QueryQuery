// Split a query-letter body into its canonical components using heuristics.
// Returns plain data with char spans so the UI can highlight each part.
import {
  GENRE_DEFS,
  LEXICONS,
  SPOILER_MARKERS,
  PERSONALIZATION_MARKERS,
  MASS_MAIL_SALUTATIONS,
  BIO_RELEVANT_MARKERS,
  BIO_PERSONAL_MARKERS,
  COMP_MARKERS,
  COMPONENT_KEYS,
} from '../../shared/constants.js';

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)]+/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;

function wordCount(text) {
  const m = String(text || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

function splitParagraphs(body) {
  return String(body || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [];
}

function includesAny(haystackLc, phrases) {
  return phrases.some((p) => haystackLc.includes(p));
}
function countMatches(haystackLc, phrases) {
  return phrases.reduce((n, p) => (haystackLc.includes(p) ? n + 1 : n), 0);
}

/** Detect genre key by alias, respecting priority and avoiding "literary agent". */
export function detectGenre(text) {
  // Lowercase, drop "literary agent" (so it doesn't read as literary fiction),
  // and normalize hyphens to spaces ("book-club" -> "book club", "sci-fi" -> "sci fi").
  const lc = ` ${String(text || '').toLowerCase()} `
    .replace(/literary (agent|agency|agents|representation|management|assistant)/g, ' ')
    .replace(/-/g, ' ');
  const candidates = [];
  for (const [key, def] of Object.entries(GENRE_DEFS)) {
    for (const aliasRaw of def.aliases) {
      const alias = aliasRaw.trim().replace(/-/g, ' ');
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(lc)) {
        candidates.push({ key, raw: aliasRaw.trim(), priority: def.priority });
        break;
      }
    }
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] || null;
}

/** Detect a manuscript word count from query text. */
export function detectWordCount(text) {
  const lc = String(text || '').toLowerCase();
  let m = lc.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*[- ]?\s*words?\b/);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (n >= 200 && n <= 400000) return n;
  }
  m = lc.match(/(?:word count|complete[d]? at|approximately|approx\.?|around|about|roughly)\D{0,14}?(\d{1,3}(?:,\d{3})+|\d{4,6})/);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (n >= 200 && n <= 400000) return n;
  }
  m = lc.match(/\b(\d{2,3})\s*k\b/);
  if (m) {
    const n = parseInt(m[1], 10) * 1000;
    if (n >= 10000 && n <= 250000) return n;
  }
  return null;
}

function detectTitle(text) {
  let m = text.match(/(?:titled|entitled|called|my novel,?|my book,?|manuscript,?|the manuscript,?)\s+["“']?([A-Z][^,."”'\n]{1,60}?)["”'.,]/);
  if (m) return m[1].trim();
  m = text.match(/["“]([^"”\n]{2,60})["”]/);
  if (m) return m[1].trim();
  return '';
}

function detectAgeCategory(lc) {
  if (/\bpicture book\b/.test(lc)) return 'picture_book';
  if (/\bmiddle grade\b|\bmg\b/.test(lc)) return 'middle_grade';
  if (/\byoung adult\b|\bya\b/.test(lc)) return 'young_adult';
  if (/\badult\b/.test(lc)) return 'adult';
  return '';
}

// Filler words to strip from the front of a captured comp title.
const COMP_LEADING_STOP = new Set(['like', 'with', 'of', 'and', 'the', 'a', 'an', 'in', 'for', 'to', 'by', 'from', 'perfect', 'readers', 'fans', 'meets', 'comparable', 'similar', 'akin', 'think']);

function cleanCompTitle(raw) {
  let parts = String(raw).replace(/[“”"]/g, '').trim().split(/\s+/);
  while (parts.length > 1 && COMP_LEADING_STOP.has(parts[0].toLowerCase().replace(/[^a-z]/g, ''))) parts.shift();
  return parts.join(' ').replace(/[,.;:!?]+$/, '').trim();
}

function extractComps(body) {
  const lc = body.toLowerCase();
  let markerIdx = -1;
  for (const mk of COMP_MARKERS) {
    const i = lc.indexOf(mk);
    if (i >= 0 && (markerIdx < 0 || i < markerIdx)) markerIdx = i;
  }

  const titles = new Set();
  const authors = new Set();
  const years = new Set();
  // Author = 2-3 capitalized tokens, allowing initials ("MJ", "V.E.", "N.K.").
  const AUTHOR = "[A-Z][A-Za-z.-]+(?:\\s+[A-Z][A-Za-z.-]+){1,2}";

  // These patterns work anywhere in the letter (no comp marker required):
  // "<Title> by <Author>"  e.g. "Counterfeit by Kirstin Chen"
  for (const m of body.matchAll(new RegExp(`((?:[A-Z][\\w’'&-]+\\s+){0,5}[A-Z][\\w’'&-]+)\\s+by\\s+(${AUTHOR})`, 'g'))) {
    const t = cleanCompTitle(m[1]);
    if (t) titles.add(t);
    authors.add(m[2].replace(/\s+/g, ' ').trim());
  }
  // "<Author>'s <Title>"  e.g. "MJ Wassmer's Zero Stars"
  for (const m of body.matchAll(new RegExp(`(${AUTHOR})[’']s\\s+((?:[A-Z][\\w’'&-]+)(?:\\s+[A-Z][\\w’'&-]+){0,5})`, 'g'))) {
    authors.add(m[1].replace(/\s+/g, ' ').trim());
    const t = cleanCompTitle(m[2]);
    if (t) titles.add(t);
  }
  // Quoted titles
  for (const m of body.matchAll(/[“"]([^”"\n]{2,60})[”"]/g)) {
    const t = cleanCompTitle(m[1]);
    if (t) titles.add(t);
  }
  // "X meets Y"
  for (const m of body.matchAll(/\b([A-Z][A-Za-z’']+(?:\s+[A-Z][A-Za-z’']+){0,4})\s+meets\s+([A-Z][A-Za-z’']+(?:\s+[A-Z][A-Za-z’']+){0,4})/g)) {
    const a = cleanCompTitle(m[1]);
    const b = cleanCompTitle(m[2]);
    if (a) titles.add(a);
    if (b) titles.add(b);
  }
  // Years only when parenthesized, e.g. "(2022)" — avoids bio years like "since 2012".
  for (const m of body.matchAll(/\((19[89]\d|20[0-4]\d)\)/g)) years.add(parseInt(m[1], 10));

  // If a comp marker is present, also pull author names + years from its clause
  // (handles "in the vein of V.E. Schwab and Naomi Novik (2021)").
  let span;
  if (markerIdx >= 0) {
    const tail = body.slice(markerIdx);
    const nl = tail.search(/\n/);
    const clause = tail.slice(0, Math.min(nl > 40 ? nl : 240, 240));
    span = [markerIdx, markerIdx + clause.length];
    for (const a of clause.matchAll(/\b([A-Z](?:\.\s?[A-Z])*\.?\s+[A-Z][a-z]+)\b/g)) authors.add(a[1].replace(/\s+/g, ' ').trim());
    for (const a of clause.matchAll(/\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g)) authors.add(a[1].trim());
    for (const y of clause.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)) years.add(parseInt(y[1], 10));
  }

  const titleArr = [...titles];
  const authorArr = [...authors];
  const present = markerIdx >= 0 || titleArr.length > 0 || authorArr.length > 0;
  if (!present) return { present: false, titles: [], authors: [], years: [], count: 0 };

  return {
    present: true,
    span,
    titles: titleArr,
    authors: authorArr,
    years: [...years],
    count: titleArr.length + authorArr.length,
  };
}

/**
 * @param {string} body cleaned plain-text query body
 * @param {string} [subject]
 * @returns {import('../../shared/types.js').Components}
 */
export function extractComponents(body, subject = '') {
  const text = String(body || '');
  const fullForMeta = `${subject}\n${text}`;
  const lc = text.toLowerCase();
  const paragraphs = splitParagraphs(text);

  // --- Salutation / personalization ---
  const firstPara = paragraphs[0] || '';
  const salPresent = /^(dear|hello|hi|greetings|good (morning|afternoon))\b/i.test(firstPara.trim());
  const massMail = includesAny(lc.slice(0, 400), MASS_MAIL_SALUTATIONS) ||
    /dear\s+[a-z .]+\band\b\s+[a-z .]+,/i.test(firstPara) ||
    /\[(agent|name|agent_name)\]|\{\{/i.test(firstPara);
  const agentNamePresent = /^dear\s+(?:(?:mr|mrs|ms|mx|dr|prof|professor)\.?\s+)?[A-Z][a-z]+/i.test(firstPara.trim()) && !massMail;
  const personalized = includesAny(lc, PERSONALIZATION_MARKERS) && !massMail;
  const salutation = {
    present: salPresent,
    text: firstPara.slice(0, 240),
    span: salPresent ? [0, Math.min(firstPara.length, 240)] : undefined,
    personalized,
    agentNamePresent,
    massMail,
  };

  // --- Metadata (word count / genre / title / age category) ---
  const wc = detectWordCount(fullForMeta);
  const genre = detectGenre(fullForMeta);
  const metadata = {
    present: wc != null || genre != null,
    wordCount: wc,
    genreKey: genre ? genre.key : null,
    genreRaw: genre ? genre.raw : '',
    title: detectTitle(fullForMeta),
    ageCategory: detectAgeCategory(lc),
  };

  // --- Pitch (body minus salutation/closing) + structure signals ---
  const middle = paragraphs.slice(salPresent ? 1 : 0);
  const pitchText = middle.join('\n\n');
  const pitchLc = pitchText.toLowerCase();
  const hasCharacter = /\b\d{1,2}-year-old\b/.test(pitchLc) || includesAny(pitchLc, LEXICONS.characterMarkers) || /\b[A-Z][a-z]+\b/.test(pitchText);
  const hasGoal = includesAny(pitchLc, LEXICONS.goal);
  const hasConflict = includesAny(pitchLc, LEXICONS.conflict);
  const hasStakes = includesAny(pitchLc, LEXICONS.stakes);
  const spoiler = includesAny(lc, SPOILER_MARKERS);
  const pitch = {
    present: wordCount(pitchText) >= 50,
    text: pitchText,
    hasCharacter,
    hasGoal,
    hasConflict,
    hasStakes,
    spoiler,
  };

  // --- Hook: a short single-sentence paragraph near the top ---
  let hook = { present: false };
  for (const p of middle.slice(0, 2)) {
    if (wordCount(p) <= 35 && splitSentences(p).length <= 1 && wordCount(p) >= 4) {
      const idx = text.indexOf(p);
      hook = { present: true, text: p, span: idx >= 0 ? [idx, idx + p.length] : undefined };
      break;
    }
  }

  // --- Comps ---
  const comps = extractComps(text);

  // --- Author bio ---
  const lastTwo = paragraphs.slice(-2).join('\n\n');
  const lastTwoLc = lastTwo.toLowerCase();
  const bioRelevant = includesAny(lc, BIO_RELEVANT_MARKERS);
  const bioPersonal = includesAny(lc, BIO_PERSONAL_MARKERS);
  const bioPresent = bioRelevant || bioPersonal || /\bi am a\b|\bi'm a\b|\bi am an\b|\bi'm an\b/.test(lastTwoLc);
  const bio = { present: bioPresent, relevant: bioRelevant, text: bioPresent ? lastTwo.slice(0, 300) : undefined };

  // --- Closing / contact ---
  const closingLc = lastTwo.toLowerCase();
  const closingPhrase = /thank you (for|so much)|thanks for|sincerely|best( regards| wishes)?|kind regards|warm regards|respectfully|cheers|regards,/.test(closingLc);
  const hasContact = EMAIL_RE.test(text) || URL_RE.test(text) || PHONE_RE.test(text);
  const closing = { present: closingPhrase || hasContact, hasContact };

  const components = { salutation, hook, pitch, comps, metadata, bio, closing };
  const presentCount = COMPONENT_KEYS.reduce((n, k) => (components[k] && components[k].present ? n + 1 : n), 0);
  components.coverage = presentCount / COMPONENT_KEYS.length;
  components.wordCountBody = wordCount(text);

  return components;
}

export default extractComponents;
