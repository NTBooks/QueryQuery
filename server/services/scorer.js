// Heuristic 0-100 scorer. Pure function of (components, config) — no AI.
import { normalizeWeights, bandForScore, clamp } from '../../shared/helpers.js';
import { GENRE_DEFS, UNPROFESSIONAL_MARKERS } from '../../shared/constants.js';

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

function wordCountBandFor(genreKey, config) {
  if (genreKey && config.genres && config.genres[genreKey]) return config.genres[genreKey];
  if (genreKey && GENRE_DEFS[genreKey]) return { min: GENRE_DEFS[genreKey].min, max: GENRE_DEFS[genreKey].max };
  return null;
}

/**
 * @param {import('../../shared/types.js').Components} c
 * @param {object} config
 * @returns {{score:number, band:string, breakdown:import('../../shared/types.js').ScoreBreakdown}}
 */
export function scoreQuery(c, config) {
  const flags = [];
  const raw = {}; // metricKey -> 0..1

  // --- wordCountFit ---
  {
    const wc = c.metadata.wordCount;
    const band = wordCountBandFor(c.metadata.genreKey, config);
    if (wc == null) {
      raw.wordCountFit = 0.4;
      flags.push('wordcount_unknown');
    } else if (!band) {
      raw.wordCountFit = 0.5; // can't judge fit without a genre band
    } else if (wc >= band.min && wc <= band.max) {
      raw.wordCountFit = 1;
    } else {
      const dev = wc < band.min ? (band.min - wc) / band.min : (wc - band.max) / band.max;
      raw.wordCountFit = clamp(1 - dev / 0.25, 0, 1);
      flags.push('wordcount_out_of_range');
    }
    if (wc != null && wc > 150000) {
      raw.wordCountFit = Math.min(raw.wordCountFit, 0.2);
      if (!flags.includes('wordcount_out_of_range')) flags.push('wordcount_out_of_range');
    }
  }

  // --- genreFit ---
  {
    const wanted = (config.wantedGenres || []).map((g) => g.toLowerCase());
    const gk = c.metadata.genreKey;
    if (!gk) {
      raw.genreFit = 0.1;
      flags.push('genre_unknown');
    } else if (wanted.length === 0) {
      raw.genreFit = 0.6; // agent open to anything
    } else if (wanted.includes(gk)) {
      raw.genreFit = 1;
    } else {
      raw.genreFit = 0.4;
      flags.push('genre_unwanted');
    }
  }

  // --- personalization ---
  {
    let v = 0;
    if (c.salutation.agentNamePresent) v += 0.4;
    if (c.salutation.personalized) v += 0.4;
    if ((c.comps.authors && c.comps.authors.length) || (c.comps.titles && c.comps.titles.length)) v += 0.2;
    if (c.salutation.massMail) {
      v = Math.max(0, v - 0.5);
      flags.push('mass_mail');
    }
    v = clamp(v, 0, 1);
    if (v < 0.3) flags.push('no_personalization');
    raw.personalization = v;
  }

  // --- compQuality ---
  {
    if (!c.comps.present || !c.comps.count) {
      raw.compQuality = 0;
      flags.push('no_comps');
    } else {
      let v = c.comps.count >= 2 ? 0.5 : 0.3;
      const years = c.comps.years || [];
      if (years.length) {
        const newest = Math.max(...years);
        const age = new Date().getFullYear() - newest;
        const r = config.compRecencyYears || { excellent: 3, good: 5, poor: 7 };
        if (age <= r.excellent) v += 0.5;
        else if (age <= r.good) v += 0.3;
        else if (age <= r.poor) v += 0.1;
        else flags.push('outdated_comps');
      } else {
        v += 0.25; // recency unknown — partial credit
      }
      raw.compQuality = clamp(v, 0, 1);
    }
  }

  // --- pitchStructure ---
  {
    const p = c.pitch;
    let v = 0.25 * (!!p.hasCharacter + !!p.hasGoal + !!p.hasConflict + !!p.hasStakes);
    if (p.spoiler) {
      v -= 0.25;
      flags.push('spoiler_reveal');
    }
    v = clamp(v, 0, 1);
    if (v < 0.5) flags.push('weak_pitch');
    raw.pitchStructure = v;
  }

  // --- professionalism ---
  {
    const body = `${c.pitch.text || ''}\n${c.salutation.text || ''}\n${c.bio.text || ''}`;
    const lc = body.toLowerCase();
    let v = 1;
    let hit = false;
    for (const m of UNPROFESSIONAL_MARKERS) if (lc.includes(m)) { v -= 0.2; hit = true; }
    // Genuine shouting = a run of 4+ consecutive ALL-CAPS words. A capitalized
    // title ("THE SALT CARTOGRAPHER") is normal in queries and must not count.
    const shouting = /(?:\b[A-Z]{3,}\b[^\S\n]+){3,}\b[A-Z]{3,}\b/.test(body);
    if (shouting) { v -= 0.2; hit = true; }
    if (EMOJI_RE.test(body)) { v -= 0.2; hit = true; }
    if ((body.match(/!/g) || []).length > 5) { v -= 0.1; hit = true; }

    // Query-length sanity (not separately weighted; folded in here).
    const bw = c.wordCountBody || 0;
    const ql = config.queryLength || { min: 200, max: 450 };
    if (bw && bw < Math.min(ql.min, 120)) { v -= 0.2; flags.push('too_short'); }
    else if (bw > ql.max * 3) { v -= 0.1; flags.push('too_long'); }

    if (hit) flags.push('unprofessional');
    raw.professionalism = clamp(v, 0, 1);
  }

  // --- keywordMatch (wanted/avoid keywords, authors, comp titles) ---
  {
    const hay = `${c.pitch.text || ''} ${c.bio.text || ''} ${c.comps.text || ''} ${c.salutation.text || ''}`.toLowerCase();
    const wanted = [...(config.keywordsWanted || []), ...(config.wantedAuthors || []), ...(config.wantedComps || [])]
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
    const avoid = (config.keywordsAvoid || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
    const matchedWanted = wanted.filter((w) => hay.includes(w)).length;
    const matchedAvoid = avoid.filter((w) => hay.includes(w)).length;

    let v = wanted.length ? (matchedWanted > 0 ? clamp(0.6 + 0.12 * matchedWanted, 0, 1) : 0.3) : 0.6;
    if (matchedAvoid > 0) { v = Math.max(0, v - 0.4 * matchedAvoid); flags.push('avoid_keyword'); }
    if (matchedWanted > 0) flags.push('wanted_keyword');
    raw.keywordMatch = clamp(v, 0, 1);
  }

  // --- authorBio ---
  {
    if (c.bio.relevant) raw.authorBio = 1;
    else if (c.bio.present) raw.authorBio = 0.4;
    else raw.authorBio = 0.5; // neutral — fine for a debut
  }

  // --- componentCoverage ---
  {
    raw.componentCoverage = c.coverage || 0;
    if ((c.coverage || 0) < 0.5) flags.push('missing_components');
  }

  // --- Combine with (renormalized) weights ---
  const weights = normalizeWeights(config.weights || {});
  const metrics = {};
  let score = 0;
  for (const key of Object.keys(weights)) {
    const value = raw[key] ?? 0;
    const weight = weights[key];
    const points = value * weight;
    metrics[key] = { value: Number(value.toFixed(3)), weight: Number(weight.toFixed(2)), points: Number(points.toFixed(2)) };
    score += points;
  }
  score = clamp(Math.round(score), 0, 100);
  const band = bandForScore(score, config.scoreBands);

  return { score, band: band.key, breakdown: { metrics, flags: [...new Set(flags)] } };
}

export default scoreQuery;
