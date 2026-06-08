import { Router } from 'express';
import repo from '../repo.js';
import { getConfig, setConfig } from '../configStore.js';
import { requireAdmin } from '../auth.js';
import { llmStatus, chatComplete, describeLlmError } from '../services/lmstudio.js';
import { extractComponents } from '../services/components.js';
import { rateLimit } from '../rateLimit.js';

const r = Router();

// The LLM proxy is expensive (one local model = one backend) and could be used to
// exhaust the server. Throttle per user and cap global concurrency; shed with 429/503.
const llmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  key: (req) => req.user?.id || req.ip,
  message: 'Too many AI requests — wait a moment and try again.',
});

let llmActive = 0;
const LLM_MAX_CONCURRENT = Number(process.env.LLM_MAX_CONCURRENT) || 3;
function llmConcurrencyGate(req, res, next) {
  if (llmActive >= LLM_MAX_CONCURRENT) {
    res.set('Retry-After', '5');
    return res.status(503).json({ error: 'The model is busy. Please retry in a moment.' });
  }
  llmActive += 1;
  let released = false;
  const release = () => { if (!released) { released = true; llmActive -= 1; } };
  res.on('finish', release);
  res.on('close', release);
  return next();
}
const llmGuards = [llmRateLimit, llmConcurrencyGate];

r.get('/status', async (req, res) => {
  // Verbose connection diagnostics are admin-only (they expose egress IPs etc.).
  res.json(await llmStatus(getConfig(), { diagnostics: req.user.role === 'admin' }));
});

// The LLM connection is GLOBAL (admin-managed); everyone uses the same model.
// The apiKey is write-only — never echo it back, just whether one is set.
function publicLlm(llm = {}) {
  return { enabled: !!llm.enabled, baseUrl: llm.baseUrl || '', model: llm.model || '', apiKeySet: !!llm.apiKey };
}

r.get('/config', (req, res) => res.json({ llm: publicLlm(getConfig().llm) }));
r.put('/config', requireAdmin, (req, res) => {
  const inc = req.body?.llm || req.body || {};
  const cfg = getConfig();
  const next = { ...cfg.llm };
  if (typeof inc.enabled === 'boolean') next.enabled = inc.enabled;
  if (typeof inc.baseUrl === 'string') next.baseUrl = inc.baseUrl;
  if (typeof inc.model === 'string') next.model = inc.model;
  // A blank/absent apiKey leaves the stored one untouched (don't clobber the secret).
  if (typeof inc.apiKey === 'string' && inc.apiKey !== '') next.apiKey = inc.apiKey;
  const saved = setConfig({ ...cfg, llm: next });
  res.json({ llm: publicLlm(saved.llm) });
});

// Resolve which model to use: explicit request > configured > whatever LM Studio has loaded.
async function resolveModel(config, reqModel) {
  if (reqModel) return reqModel;
  if (config.llm?.model) return config.llm.model;
  const s = await llmStatus(config);
  return s.loadedModel || '';
}

function summaryMessages(t) {
  return [
    {
      role: 'system',
      content:
        'You summarize literary query letters for a busy agent in 1-2 plain, neutral sentences. ' +
        'State the genre, premise and any standout credentials. Do not invent details and do not give a verdict.',
    },
    { role: 'user', content: `Subject: ${t.subject || '(none)'}\n\n${t.body || ''}` },
  ];
}

r.post('/summarize', llmGuards, async (req, res) => {
  const config = getConfig();
  const t = repo.getRawByIdOwned(Number(req.body?.id), req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  try {
    const content = await chatComplete(config, {
      messages: summaryMessages(t),
      maxTokens: 1500, // headroom so reasoning models finish and the answer lands in `content`
      model: await resolveModel(config, req.body?.model),
    });
    const summary = String(content).trim();
    repo.setSummary(t.id, summary, new Date().toISOString());
    res.json({ id: t.id, summary });
  } catch (err) {
    const e = describeLlmError(err);
    res.status(e.status).json({ error: e.message });
  }
});

const TRIAGE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'triage',
    strict: false,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        suggestedStatus: { type: 'string', enum: ['reject', 'second_look', 'accept', 'hold'] },
        aiOpinion: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'suggestedStatus'],
    },
  },
};

r.post('/triage', llmGuards, async (req, res) => {
  const config = getConfig();
  const t = repo.getRawByIdOwned(Number(req.body?.id), req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  try {
    const content = await chatComplete(config, {
      messages: [
        {
          role: 'system',
          content:
            'You are an advisory assistant to a literary agent. Output ONLY JSON matching the schema. ' +
            'suggestedStatus is advisory and the agent makes the final call. Be concise.',
        },
        { role: 'user', content: `Subject: ${t.subject || '(none)'}\n\n${t.body || ''}` },
      ],
      maxTokens: 2200,
      model: await resolveModel(config, req.body?.model),
      responseFormat: TRIAGE_SCHEMA,
    });
    let triage;
    try {
      triage = JSON.parse(content);
    } catch {
      triage = { summary: String(content).trim(), suggestedStatus: null, raw: true };
    }
    repo.setTriage(t.id, JSON.stringify(triage), new Date().toISOString());
    res.json({ id: t.id, triage });
  } catch (err) {
    const e = describeLlmError(err);
    res.status(e.status).json({ error: e.message });
  }
});

// AI-assisted extraction: fuzzily identify fields the heuristics missed
// (genre, word count, title, comps) plus themes/keywords to import into config.
const EXTRACT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'extract',
    schema: {
      type: 'object',
      properties: {
        genre: { type: 'string' },
        wordCount: { type: 'integer' },
        title: { type: 'string' },
        ageCategory: { type: 'string' },
        authorName: { type: 'string' },
        authorEmail: { type: 'string' },
        comps: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, author: { type: 'string' }, year: { type: 'integer' } },
            required: ['title'],
          },
        },
        themes: { type: 'array', items: { type: 'string' } },
        keywords: { type: 'array', items: { type: 'string' } },
      },
      required: ['genre', 'title', 'authorName', 'comps', 'themes', 'keywords'],
    },
  },
};

const EXTRACT_SYS =
  'You extract structured metadata from a literary query letter and output ONLY JSON matching the schema.\n' +
  '- genre, wordCount (integer), ageCategory (adult / young adult / middle grade / picture book): give your best ' +
  'inference even if not stated explicitly.\n' +
  '- title, authorName, authorEmail: use ONLY what literally appears in the letter (its title and signature). ' +
  'If absent, use an empty string.\n' +
  '- comps: list ONLY comparable titles and their authors that actually appear in the letter; never invent any. ' +
  'Include year only if stated.\n' +
  '- themes, keywords: short descriptive phrases about the book.\n' +
  "Never output placeholder text such as 'unknown', 'none', or 'not detected'.";

r.post('/extract', llmGuards, async (req, res) => {
  const config = getConfig();
  let text;
  let subject = '';
  let id = null;
  if (req.body?.id != null) {
    const t = repo.getRawByIdOwned(Number(req.body.id), req.user.id);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    text = t.body;
    subject = t.subject || '';
    id = t.id;
  } else {
    text = req.body?.text;
    subject = req.body?.subject || '';
  }
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Provide text or a ticket id.' });

  // Tell the model which fields the heuristics could not find, so it focuses there.
  const c = extractComponents(String(text), String(subject));
  const missing = [];
  if (!c.metadata.genreKey) missing.push('genre');
  if (c.metadata.wordCount == null) missing.push('word count');
  if (!c.metadata.title) missing.push('title');
  if (!c.comps.present || !c.comps.count) missing.push('comparable titles');

  try {
    const content = await chatComplete(config, {
      messages: [
        { role: 'system', content: EXTRACT_SYS },
        { role: 'user', content: `Subject: ${subject || '(none)'}\n\n${text}` },
      ],
      maxTokens: 1500,
      model: await resolveModel(config, req.body?.model),
      responseFormat: EXTRACT_SCHEMA,
    });
    let extract;
    try {
      extract = JSON.parse(content);
    } catch {
      extract = { raw: String(content).trim() };
    }
    // Sanity-fix word count: models often return "80" meaning 80,000.
    if (extract && typeof extract.wordCount === 'number') {
      let n = extract.wordCount;
      if (n > 0 && n < 1000) n *= 1000;
      extract.wordCount = n >= 1000 && n <= 400000 ? n : null;
    }
    if (id != null) repo.setExtract(id, JSON.stringify(extract), new Date().toISOString());
    res.json({ id, extract, missing });
  } catch (err) {
    const e = describeLlmError(err);
    res.status(e.status).json({ error: e.message });
  }
});

export default r;
