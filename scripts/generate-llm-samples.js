// OPTIONAL: generate naturalistic bad/borderline query letters via LM Studio.
// Requires LM Studio running with a model loaded. Falls back gracefully if not.
// The deterministic generator (generate-samples.js) remains the default.
import { SAMPLES_DIR, writeEml, slugify, authorEmail, ensureDir } from './eml-utils.js';
import { getConfig } from '../server/configStore.js';
import { llmStatus, chatComplete } from '../server/services/lmstudio.js';

const PROMPTS = [
  { tag: 'weak_stakes', genre: 'fantasy', prompt: 'Write a mediocre fantasy query letter (about 200 words) with a vague premise, weak stakes, and generic personalization ("Dear Agent"). Make it plausible but clearly not ready. Output only the letter.' },
  { tag: 'overwritten', genre: 'literary fiction', prompt: 'Write an overwritten literary-fiction query letter (about 250 words) that is pretentious, buries the premise, and gives no comps. Output only the letter.' },
  { tag: 'ai_flavored', genre: 'science fiction', prompt: 'Write a science-fiction query letter (about 220 words) in a very uniform, polished, slightly robotic tone that overuses words like "delve", "tapestry", "navigate", and "resonate". Output only the letter.' },
  { tag: 'unprofessional', genre: 'thriller', prompt: 'Write an unprofessional thriller query letter (about 200 words) that brags it will be a bestseller, mentions previous rejections, and uses ALL CAPS for emphasis. Output only the letter.' },
  { tag: 'no_comps', genre: 'romance', prompt: 'Write a romance query letter (about 200 words) that summarizes the entire plot including the ending, with no comp titles. Output only the letter.' },
  { tag: 'borderline_good', genre: 'mystery', prompt: 'Write a borderline-decent mystery query letter (about 230 words) with a clear hook and stakes but slightly outdated comps. Output only the letter.' },
];

async function main() {
  ensureDir(SAMPLES_DIR);
  const config = getConfig();
  const status = await llmStatus(config);
  if (!status.reachable) {
    console.error(`\n  LM Studio not reachable (${status.error || 'no server'}). Skipping LLM samples.\n`);
    process.exit(0);
  }
  if (!status.loadedModel) {
    console.error('\n  LM Studio reachable but no model loaded. Load a model and retry. Skipping.\n');
    process.exit(0);
  }
  const model = config.llm.model || status.loadedModel;
  const perPrompt = Number(process.argv[2] || 2);
  console.log(`\n  Generating LLM samples with model: ${model}\n`);

  let written = 0;
  for (const spec of PROMPTS) {
    for (let i = 0; i < perPrompt; i += 1) {
      try {
        const content = await chatComplete(config, {
          model,
          maxTokens: 500,
          temperature: 0.9,
          messages: [
            { role: 'system', content: 'You generate sample query letters for testing a triage tool. Output ONLY the letter text, no preamble.' },
            { role: 'user', content: spec.prompt },
          ],
        });
        const text = String(content).trim();
        if (!text) continue;
        const author = `${['Sam', 'Alex', 'Jordan', 'Casey', 'Robin'][i % 5]} Test`;
        const filename = `llm-${slugify(spec.tag, 16)}-${i + 1}.eml`;
        await writeEml(SAMPLES_DIR, filename, {
          from: `${author} <${authorEmail(author)}>`,
          subject: `Query: ${spec.tag} / ${spec.genre}`,
          text,
          headers: {
            'X-QQ-Corpus': 'llm',
            'X-QQ-Genre': spec.genre,
            'X-QQ-Defects': spec.tag,
          },
        });
        written += 1;
        console.log(`  wrote ${filename}`);
      } catch (err) {
        console.error(`  failed (${spec.tag}): ${err.message}`);
      }
    }
  }
  console.log(`\n  Done — ${written} LLM sample(s) in samples/.\n`);
}

main().catch((err) => {
  console.error('generate-llm-samples failed:', err);
  process.exit(1);
});
