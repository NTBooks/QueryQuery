// Thin data-access layer over the tickets table.
import db from './db.js';

function safeParse(s) {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Convert a DB row into a client-friendly ticket (JSON fields parsed, booleans real). */
export function rowToTicket(r) {
  if (!r) return null;
  return {
    ...r,
    ai_disclosed: !!r.ai_disclosed,
    cl_stamped: !!r.cl_stamped,
    components: safeParse(r.components),
    breakdown: safeParse(r.breakdown),
    llm_triage: safeParse(r.llm_triage),
    llm_extract: safeParse(r.llm_extract),
    cl_result: safeParse(r.cl_result),
    archive_zip: r.archive_zip || null,
  };
}

const stmts = {
  all: db.prepare('SELECT * FROM tickets ORDER BY score DESC, id ASC'),
  byId: db.prepare('SELECT * FROM tickets WHERE id = ?'),
  byFile: db.prepare('SELECT id, status FROM tickets WHERE source_file = ?'),
  insert: db.prepare(`
    INSERT INTO tickets
      (source_file, from_addr, from_name, subject, received_at, body, components,
       score, score_band, breakdown, ai_suspicion, ai_disclosed, cliche_score,
       status, config_hash, created_at, updated_at)
    VALUES
      (@source_file, @from_addr, @from_name, @subject, @received_at, @body, @components,
       @score, @score_band, @breakdown, @ai_suspicion, @ai_disclosed, @cliche_score,
       @status, @config_hash, @now, @now)
  `),
  updateScores: db.prepare(`
    UPDATE tickets SET
      from_addr=@from_addr, from_name=@from_name, subject=@subject, received_at=@received_at,
      body=@body, components=@components, score=@score, score_band=@score_band,
      breakdown=@breakdown, ai_suspicion=@ai_suspicion, ai_disclosed=@ai_disclosed,
      cliche_score=@cliche_score, config_hash=@config_hash, updated_at=@now
    WHERE id=@id
  `),
  rescoreRow: db.prepare(`
    UPDATE tickets SET
      components=@components, score=@score, score_band=@score_band, breakdown=@breakdown,
      ai_suspicion=@ai_suspicion, ai_disclosed=@ai_disclosed, cliche_score=@cliche_score,
      config_hash=@config_hash, updated_at=@now
    WHERE id=@id
  `),
  updateStatus: db.prepare('UPDATE tickets SET status=?, updated_at=? WHERE id=?'),
  updateSummary: db.prepare('UPDATE tickets SET llm_summary=?, updated_at=? WHERE id=?'),
  updateTriage: db.prepare('UPDATE tickets SET llm_triage=?, updated_at=? WHERE id=?'),
  updateExtract: db.prepare('UPDATE tickets SET llm_extract=?, updated_at=? WHERE id=?'),
  updateCert: db.prepare('UPDATE tickets SET cl_cid=?, cl_stamped=1, cl_stamped_at=?, cl_result=?, updated_at=? WHERE id=?'),
  setArchive: db.prepare('UPDATE tickets SET archive_zip=?, updated_at=? WHERE source_file=?'),
  del: db.prepare('DELETE FROM tickets WHERE id=?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM tickets'),
};

export const repo = {
  getAll: () => stmts.all.all().map(rowToTicket),
  getRawAll: () => stmts.all.all(),
  getById: (id) => rowToTicket(stmts.byId.get(id)),
  getRawById: (id) => stmts.byId.get(id),
  findByFile: (file) => stmts.byFile.get(file),
  insert: (row) => stmts.insert.run(row),
  updateScores: (row) => stmts.updateScores.run(row),
  rescoreRow: (row) => stmts.rescoreRow.run(row),
  setStatus: (id, status, now) => stmts.updateStatus.run(status, now, id),
  setSummary: (id, summary, now) => stmts.updateSummary.run(summary, now, id),
  setTriage: (id, triageJson, now) => stmts.updateTriage.run(triageJson, now, id),
  setExtract: (id, extractJson, now) => stmts.updateExtract.run(extractJson, now, id),
  setCertification: (id, cid, resultJson, now) => stmts.updateCert.run(cid, now, resultJson, now, id),
  setArchiveZip: (sourceFile, zip, now) => stmts.setArchive.run(zip, now, sourceFile),
  remove: (id) => stmts.del.run(id),
  count: () => stmts.count.get().n,
};

export default repo;
