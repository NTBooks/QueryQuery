// Preview analysis of pasted query-letter text — runs the full heuristic
// pipeline but does NOT persist anything.
import { Router } from 'express';
import { getConfig } from '../configStore.js';
import { analyze } from '../services/ingest.js';

const r = Router();

r.post('/', (req, res) => {
  const { text, subject = '' } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Provide letter text to analyze.' });
  }
  const config = getConfig();
  const a = analyze(String(text), String(subject), config);
  res.json({
    subject,
    body: String(text),
    components: a.components,
    score: a.score,
    score_band: a.band,
    breakdown: a.breakdown,
    ai_suspicion: a.ai.aiSuspicion,
    ai_disclosed: a.ai.aiDisclosed,
    cliche_score: a.ai.clicheScore,
  });
});

export default r;
