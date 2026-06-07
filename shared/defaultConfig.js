// The default scoring configuration. Written to config/queryquery.config.json
// on first run, then editable in the app's Config form.
import {
  GENRE_DEFS,
  DEFAULT_SCORE_BANDS,
  DEFAULT_AI_PHRASES,
  DEFAULT_CLICHE_PHRASES,
} from './constants.js';

// Derive the per-genre word-count bands from the taxonomy so the two never drift.
const genreBands = Object.fromEntries(
  Object.entries(GENRE_DEFS).map(([key, def]) => [key, { min: def.min, max: def.max }])
);

export const DEFAULT_CONFIG = {
  inputFolder: './input',

  // After a batch is ingested, move the processed .eml into input/archive/ as a
  // single per-batch .zip (keeps the inbox clean). Originals stay available for
  // Certify Receipt (read back from the zip on demand).
  archiveProcessed: true,

  // What the agent is looking for (the "form").
  wantedGenres: ['fantasy', 'sci_fi'],
  wantedAuthors: [],
  wantedComps: [],
  keywordsWanted: [],
  keywordsAvoid: [],

  // Per-genre debut word-count bands (editable).
  genres: genreBands,

  compRecencyYears: { excellent: 3, good: 5, poor: 7 },
  queryLength: { min: 200, idealMin: 250, idealMax: 400, max: 450 },

  // Metric weights (UI sliders). Renormalized to 100 by the scorer.
  weights: {
    wordCountFit: 20,
    genreFit: 15,
    personalization: 15,
    compQuality: 12,
    pitchStructure: 12,
    professionalism: 10,
    keywordMatch: 6,
    authorBio: 5,
    componentCoverage: 5,
  },

  // Swimlane score bands (rows).
  scoreBands: DEFAULT_SCORE_BANDS.map((b) => ({ ...b })),

  // Heuristic phrase lists (editable).
  aiPhraseBlocklist: [...DEFAULT_AI_PHRASES],
  clichePhrases: [...DEFAULT_CLICHE_PHRASES],

  // AI-suspicion sub-score: advisory only by default (weight 0 in main score).
  aiSuspicion: {
    enabled: true,
    weightInMainScore: 0,
    thresholds: { burstinessMinStdDev: 4, typeTokenMin: 0.4, emDashPer250: 4, suspicionFlagAt: 60 },
  },

  // AI disclosure: surface as a badge, do not auto-penalize.
  aiDisclosure: { flagOnly: true },

  // Optional local LLM via LM Studio.
  llm: {
    enabled: false,
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: '',
    apiKey: 'lm-studio',
  },

  // Optional Chainletter "Certify Receipt" — blockchain-timestamp a hash of the
  // original letter (the contents are never uploaded). Users supply ONLY the token
  // URL; claiming it once yields the webhook URL + JWT + group, which are cached.
  chainletter: {
    enabled: false,
    tokenUrl: '', // https://{server}/jwt/{token} — the ONLY field you need
    verifyUrlTemplate: 'https://{server}/verify/{cid}', // {server} = tenant (public verify page)
    // claim: { tokenUrl, webhookurl, jwt, groupname, tenant, expires } — server-managed cache
  },
};

export default DEFAULT_CONFIG;
