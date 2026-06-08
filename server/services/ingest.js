// Ingestion pipeline: scan .eml folder -> parse -> components -> score -> upsert,
// then archive the processed batch (zip into input/archive/).
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { userInputDir } from '../configStore.js';
import repo from '../repo.js';
import parseEml, { buildSanitizedEml } from './emlParser.js';
import extractComponents from './components.js';
import scoreQuery from './scorer.js';
import analyzeAi from './aiHeuristics.js';

// Reject oversized uploads (almost always attachment-laden). We never use
// attachments, so there's no reason to read or store megabytes of them.
const MAX_EML_BYTES = 2 * 1024 * 1024;

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

/** Zip a processed batch (sanitized, attachment-free content) and remove the loose originals. */
async function archiveBatch(dir, items) {
  if (!items.length) return null;
  const archiveDir = path.join(dir, 'archive');
  await fs.mkdir(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const zipName = `batch-${stamp}.zip`;
  const zip = new AdmZip();
  for (const it of items) {
    zip.addFile(it.name, Buffer.from(it.content, 'utf8')); // body-only, no attachments
  }
  zip.writeZip(path.join(archiveDir, zipName));
  for (const it of items) {
    try {
      await fs.rm(path.join(dir, it.name));
    } catch {
      /* already gone */
    }
  }
  return { count: items.length, zip: zipName };
}

async function runIngestFolder(config, hash, ownerId) {
  if (!ownerId) return { scanned: 0, added: 0, updated: 0, errors: [], error: 'No owner' };
  const dir = userInputDir(config, ownerId);
  const summary = { scanned: 0, added: 0, updated: 0, errors: [], inputDir: dir };

  let files;
  try {
    // Top-level .eml only — the archive/ subfolder is intentionally ignored.
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.eml'));
  } catch {
    summary.error = `Input folder not found: ${dir}`;
    return summary;
  }

  const processed = []; // { name, content } — sanitized, attachment-free
  for (const file of files) {
    summary.scanned += 1;
    const fp = path.join(dir, file);
    try {
      const stat = await fs.stat(fp);
      if (stat.size > MAX_EML_BYTES) {
        summary.errors.push({ file, message: `Skipped — file too large (${Math.round(stat.size / 1024)} KB); strip attachments.` });
        await fs.rm(fp).catch(() => {}); // don't leave huge files lying around
        continue;
      }
      const raw = await fs.readFile(fp);
      const parsed = await parseEml(raw); // attachments are never read into the ticket
      const analysis = analyze(parsed.body, parsed.subject, config);
      const now = new Date().toISOString();
      const row = toRow(parsed, file, analysis, hash, now);

      const existing = repo.findByFile(file);
      if (existing) {
        repo.updateScores({ ...row, id: existing.id });
        summary.updated += 1;
      } else {
        repo.insert({ ...row, status: 'did_not_review', owner_id: ownerId });
        summary.added += 1;
      }
      processed.push({ name: file, content: buildSanitizedEml(parsed) });
    } catch (err) {
      summary.errors.push({ file, message: err.message });
    }
  }

  // Archive the processed batch (sanitized) and clean the inbox.
  if (config.archiveProcessed !== false && processed.length) {
    const arch = await archiveBatch(dir, processed);
    if (arch) {
      const now = new Date().toISOString();
      for (const it of processed) repo.setArchiveZip(it.name, arch.zip, now);
      summary.archived = arch;
    }
  }

  return summary;
}

// Serialize ingest runs so concurrent triggers (scan + upload + watcher) can't
// race on the same files (double-process / archive collisions).
let ingestChain = Promise.resolve();
export function ingestFolder(config, hash, ownerId) {
  const run = () => runIngestFolder(config, hash, ownerId);
  const p = ingestChain.then(run, run);
  ingestChain = p.then(() => {}, () => {});
  return p;
}

/** Re-score a user's existing tickets from their stored body (no file re-read). */
export function rescoreAll(config, hash, ownerId) {
  const rows = ownerId ? repo.getRawAllByOwner(ownerId) : repo.getRawAll();
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
