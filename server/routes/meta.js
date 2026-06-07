// Static metadata the client needs to render labels, options and bands.
import { Router } from 'express';
import {
  STATES,
  GENRE_DEFS,
  DEFAULT_SCORE_BANDS,
  METRIC_LABELS,
  FLAG_LABELS,
} from '../../shared/constants.js';

const r = Router();

r.get('/', (req, res) => {
  res.json({
    states: STATES,
    genres: Object.entries(GENRE_DEFS).map(([key, d]) => ({ key, label: d.label, min: d.min, max: d.max })),
    defaultScoreBands: DEFAULT_SCORE_BANDS,
    metricLabels: METRIC_LABELS,
    flagLabels: FLAG_LABELS,
  });
});

export default r;
