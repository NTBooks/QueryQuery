// Ingestion pipeline: scan .eml folder -> parse -> components -> score -> upsert,
// then archive the processed batch (zip into input/archive/).
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { inputDir } from '../configStore.js';
import repo from '../repo.js';
import parseEml from './emlParser.js';
import extractComponents from './components.js';
import scoreQuery from './scorer.js';
import analyzeAi from './aiHeuristics.js';

/** Compute all heuristic fields for a letter. Reused by ingest + rescore + LLM. */
export function analyze(body, subject, config) {
  const components = extractComponents(body, subject);
  const { score, band, breakdown } = scoreQuery(components, config);
  const ai = analyzeAi(body, config);

  // Optionally fold AI suspicion into the main score (default weight 0).
  let finalScore = score;
  const w = config.aiSuspicion?.weightInMainScore || 0;
  if (config.aiSuspicion?.enabled && w > 0) {
    finalScore = Math.round(score * (1 - w / 100) + (100 - ai.aiSuspicion) * (w / 100));
  }

  // Persist AI signal detail inside the breakdown so the UI can explain it.
  breakdown.ai = {
    signals: ai.signals,
    matchedAiPhrases: ai.matchedAiPhrases,
    matchedCliches: ai.matchedCliches,
  };

  return { components, score: finalScore, band, breakdown, ai };
}

function toRow(parsed, sourceFile, analysis, hash, now) {
  return {
    source_file: sourceFile,
    from_addr: parsed.from_addr,
    from_name: parsed.from_name,
    subject: parsed.subject,
    received_at: parsed.received_at,
    body: parsed.body,
    components: JSON.stringify(analysis.components),
    score: analysis.score,
    score_band: analysis.band,
    breakdown: JSON.stringify(analysis.breakdown),
    ai_suspicion: analysis.ai.aiSuspicion,
    ai_disclosed: analysis.ai.aiDisclosed ? 1 : 0,
    cliche_score: analysis.ai.clicheScore,
    config_hash: hash,
    now,
  };
}

/** Zip a processed batch into input/archive/ and remove the loose originals. */
async function archiveBatch(dir, files) {
  if (!files.length) return null;
  const archiveDir = path.join(dir, 'archive');
  await fs.mkdir(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const zipName = `batch-${stamp}.zip`;
  const zip = new AdmZip();
  for (const f of files) {
    try {
      zip.addLocalFile(path.join(dir, f)); // entry name = the filename
    } catch {
      /* skip unreadable */
    }
  }
  zip.writeZip(path.join(archiveDir, zipName));
  for (const f of files) {
    try {
      await fs.rm(path.join(dir, f));
    } catch {
      /* already gone */
    }
  }
  return { count: files.length, zip: zipName };
}

async function runIngestFolder(config, hash) {
  const dir = inputDir(config);
  const summary = { scanned: 0, added: 0, updated: 0, errors: [], inputDir: dir };

  let files;
  try {
    // Top-level .eml only — the archive/ subfolder is intentionally ignored.
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.eml'));
  } catch {
    summary.error = `Input folder not found: ${dir}`;
    return summary;
  }

  const processed = [];
  for (const file of files) {
    summary.scanned += 1;
    try {
      const raw = await fs.readFile(path.join(dir, file));
      const parsed = await parseEml(raw);
      const analysis = analyze(parsed.body, parsed.subject, config);
      const now = new Date().toISOString();
      const row = toRow(parsed, file, analysis, hash, now);

      const existing = repo.findByFile(file);
      if (existing) {
        repo.updateScores({ ...row, id: existing.id });
        summary.updated += 1;
      } else {
        repo.insert({ ...row, status: 'did_not_review' });
        summary.added += 1;
      }
      processed.push(file);
    } catch (err) {
      summary.errors.push({ file, message: err.message });
    }
  }

  // Archive the processed batch (keeps the inbox clean; originals stay in the zip
  // so Certify Receipt can still read the exact bytes later).
  if (config.archiveProcessed !== false && processed.length) {
    const arch = await archiveBatch(dir, processed);
    if (arch) {
      const now = new Date().toISOString();
      for (const f of processed) repo.setArchiveZip(f, arch.zip, now);
      summary.archived = arch;
    }
  }

  return summary;
}

// Serialize ingest runs so concurrent triggers (scan + upload + watcher) can't
// race on the same files (double-process / archive collisions).
let ingestChain = Promise.resolve();
export function ingestFolder(config, hash) {
  const run = () => runIngestFolder(config, hash);
  const p = ingestChain.then(run, run);
  ingestChain = p.then(() => {}, () => {});
  return p;
}

/** Re-score every existing ticket from its stored body (no file re-read). */
export function rescoreAll(config, hash) {
  const rows = repo.getRawAll();
  let updated = 0;
  for (const r of rows) {
    const analysis = analyze(r.body || '', r.subject || '', config);
    const now = new Date().toISOString();
    repo.rescoreRow({
      id: r.id,
      components: JSON.stringify(analysis.components),
      score: analysis.score,
      score_band: analysis.band,
      breakdown: JSON.stringify(analysis.breakdown),
      ai_suspicion: analysis.ai.aiSuspicion,
      ai_disclosed: analysis.ai.aiDisclosed ? 1 : 0,
      cliche_score: analysis.ai.clicheScore,
      config_hash: hash,
      now,
    });
    updated += 1;
  }
  return { rescored: updated };
}

export default ingestFolder;
