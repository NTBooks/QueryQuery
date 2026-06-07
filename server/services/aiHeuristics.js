// AI-suspicion + disclosure + cliché heuristics. NO AI is used here — these are
// purely statistical/text-matching signals, surfaced as ADVISORY indicators.
import { clamp } from '../../shared/helpers.js';
import {
  EMOTION_WORDS,
  CONTRACTION_RE,
  AI_DISCLOSURE_MARKERS,
  DEFAULT_AI_PHRASES,
  DEFAULT_CLICHE_PHRASES,
} from '../../shared/constants.js';
import { splitSentences } from './components.js';

function words(text) {
  return (String(text || '').toLowerCase().match(/[a-z']+/g)) || [];
}
function stddev(nums) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

/**
 * @param {string} body cleaned query text
 * @param {object} config
 * @returns {{aiSuspicion:number, aiDisclosed:boolean, clicheScore:number, signals:object, matchedAiPhrases:string[], matchedCliches:string[]}}
 */
export function analyzeAi(body, config = {}) {
  const text = String(body || '');
  const lc = text.toLowerCase();
  const ws = words(text);
  const n = ws.length;

  // Disclosure + cliché are plain string matches — valid even for very short text,
  // so compute them before the length guard below.
  const aiDisclosed = AI_DISCLOSURE_MARKERS.some((m) => lc.includes(m));
  const clicheList = (config.clichePhrases && config.clichePhrases.length ? config.clichePhrases : DEFAULT_CLICHE_PHRASES).map((p) => p.toLowerCase());
  const matchedCliches = [...new Set(clicheList.filter((p) => lc.includes(p)))];
  const clicheScore = clamp(Math.round((matchedCliches.length / 4) * 100), 0, 100);

  if (n < 20) {
    return { aiSuspicion: 0, aiDisclosed, clicheScore, signals: {}, matchedAiPhrases: [], matchedCliches };
  }

  const thr = (config.aiSuspicion && config.aiSuspicion.thresholds) || { burstinessMinStdDev: 4, typeTokenMin: 0.4, emDashPer250: 4 };

  // Burstiness: stddev of sentence lengths (in words). Low => suspicious.
  const sentLens = splitSentences(text).map((s) => (s.match(/\S+/g) || []).length).filter((l) => l > 0);
  const burst = stddev(sentLens);
  const sBurst = clamp((thr.burstinessMinStdDev - burst) / thr.burstinessMinStdDev, 0, 1);

  // Type-token ratio. Low => suspicious.
  const ttr = new Set(ws).size / n;
  const sTtr = clamp((thr.typeTokenMin - ttr) / thr.typeTokenMin, 0, 1);

  // Em-dash density per 250 words. High => suspicious.
  const emCount = (text.match(/[—–]/g) || []).length;
  const emPer250 = (emCount / n) * 250;
  const sEm = clamp((emPer250 - thr.emDashPer250) / thr.emDashPer250, 0, 1);

  // Contraction frequency per 100 words. Low => suspicious.
  const contractions = (text.match(CONTRACTION_RE) || []).length;
  const contrPer100 = (contractions / n) * 100;
  const sContr = clamp((1.5 - contrPer100) / 1.5, 0, 1);

  // AI-vocabulary phrase matches.
  const aiList = (config.aiPhraseBlocklist && config.aiPhraseBlocklist.length ? config.aiPhraseBlocklist : DEFAULT_AI_PHRASES).map((p) => p.toLowerCase());
  const matchedAiPhrases = [...new Set(aiList.filter((p) => lc.includes(p)))];
  const sPhrase = clamp(matchedAiPhrases.length / 4, 0, 1);

  // Emotional/affect word frequency. Low => suspicious (flat affect).
  const emotionMatches = EMOTION_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lc)).length;
  const sEmotion = clamp((3 - emotionMatches) / 3, 0, 1);

  const suspicion =
    0.30 * sPhrase +
    0.20 * sBurst +
    0.15 * sTtr +
    0.15 * sEm +
    0.10 * sContr +
    0.10 * sEmotion;
  const aiSuspicion = clamp(Math.round(suspicion * 100), 0, 100);

  return {
    aiSuspicion,
    aiDisclosed,
    clicheScore,
    signals: {
      burstiness: Number(burst.toFixed(2)),
      typeTokenRatio: Number(ttr.toFixed(3)),
      emDashPer250: Number(emPer250.toFixed(2)),
      contractionsPer100: Number(contrPer100.toFixed(2)),
      aiPhraseMatches: matchedAiPhrases.length,
      emotionMatches,
      components: {
        phrase: Number(sPhrase.toFixed(2)),
        burstiness: Number(sBurst.toFixed(2)),
        typeToken: Number(sTtr.toFixed(2)),
        emDash: Number(sEm.toFixed(2)),
        contractions: Number(sContr.toFixed(2)),
        emotion: Number(sEmotion.toFixed(2)),
      },
    },
    matchedAiPhrases,
    matchedCliches,
  };
}

export default analyzeAi;
