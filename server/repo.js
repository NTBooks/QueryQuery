// Thin data-access layer over the tickets + users tables.
import db from './db.js';
import { genId, hashPassword } from './password.js';

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

function publicUser(r) {
  return r ? { id: r.id, username: r.username, role: r.role } : null;
}

const stmts = {
  all: db.prepare('SELECT * FROM tickets ORDER BY score DESC, id ASC'),
  allByOwner: db.prepare('SELECT * FROM tickets WHERE owner_id = ? AND archived_iteration IS NULL ORDER BY score DESC, id ASC'),
  byId: db.prepare('SELECT * FROM tickets WHERE id = ?'),
  byIdOwned: db.prepare('SELECT * FROM tickets WHERE id = ? AND owner_id = ?'),
  byFile: db.prepare('SELECT id, status FROM tickets WHERE source_file = ? AND owner_id = ?'),
  // board archiving
  maxIter: db.prepare('SELECT MAX(archived_iteration) AS m FROM tickets WHERE owner_id = ?'),
  archiveActive: db.prepare('UPDATE tickets SET archived_iteration=@iter, archive_comment=@comment, archived_at=@now WHERE owner_id=@owner AND archived_iteration IS NULL'),
  archiveActiveStatus: db.prepare('UPDATE tickets SET archived_iteration=@iter, archive_comment=@comment, archived_at=@now WHERE owner_id=@owner AND archived_iteration IS NULL AND status=@status'),
  listArch: db.prepare('SELECT archived_iteration AS iteration, COUNT(*) AS count, archive_comment AS comment, MAX(archived_at) AS at FROM tickets WHERE owner_id = ? AND archived_iteration IS NOT NULL GROUP BY archived_iteration ORDER BY archived_iteration DESC'),
  restoreArch: db.prepare('UPDATE tickets SET archived_iteration=NULL, archive_comment=NULL, archived_at=NULL WHERE owner_id=? AND archived_iteration=?'),
  // users
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  usersAll: db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC'),
  adminId: db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1"),
  insertUser: db.prepare('INSERT INTO users (id, username, pw_hash, pw_salt, role, created_at) VALUES (@id,@username,@pw_hash,@pw_salt,@role,@created_at)'),
  setPw: db.prepare('UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?'),
  setUserCl: db.prepare('UPDATE users SET cl_token_url=?, cl_enabled=?, cl_claim=? WHERE id=?'),
  setUserClaimStmt: db.prepare('UPDATE users SET cl_claim=? WHERE id=?'),
  setUserConfigStmt: db.prepare('UPDATE users SET config=? WHERE id=?'),
  setUserProfilesStmt: db.prepare('UPDATE users SET profiles=? WHERE id=?'),
  insert: db.prepare(`
    INSERT INTO tickets
      (source_file, from_addr, from_name, subject, received_at, body, components,
       score, score_band, breakdown, ai_suspicion, ai_disclosed, cliche_score,
       status, config_hash, owner_id, created_at, updated_at)
    VALUES
      (@source_file, @from_addr, @from_name, @subject, @received_at, @body, @components,
       @score, @score_band, @breakdown, @ai_suspicion, @ai_disclosed, @cliche_score,
       @status, @config_hash, @owner_id, @now, @now)
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
  setArchive: db.prepare('UPDATE tickets SET archive_zip=?, updated_at=? WHERE source_file=? AND owner_id=?'),
  del: db.prepare('DELETE FROM tickets WHERE id=?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM tickets'),
};

export const repo = {
  getAll: () => stmts.all.all().map(rowToTicket),
  getAllByOwner: (ownerId) => stmts.allByOwner.all(ownerId).map(rowToTicket),
  getRawAll: () => stmts.all.all(),
  getRawAllByOwner: (ownerId) => stmts.allByOwner.all(ownerId),
  getById: (id) => rowToTicket(stmts.byId.get(id)),
  getRawById: (id) => stmts.byId.get(id),
  getRawByIdOwned: (id, ownerId) => stmts.byIdOwned.get(id, ownerId),
  getByIdOwned: (id, ownerId) => rowToTicket(stmts.byIdOwned.get(id, ownerId)),
  findByFile: (file, ownerId) => stmts.byFile.get(file, ownerId),
  insert: (row) => stmts.insert.run(row),

  // --- users ---
  getUserByUsername: (username) => stmts.userByName.get(username),
  getUserById: (id) => stmts.userById.get(id),
  listUsers: () => stmts.usersAll.all(),
  getAdminId: () => stmts.adminId.get()?.id || null,
  publicUser,
  createUser: async ({ username, password, role = 'user' }) => {
    const { salt, hash } = await hashPassword(password);
    const row = { id: genId(), username, pw_hash: hash, pw_salt: salt, role, created_at: new Date().toISOString() };
    stmts.insertUser.run(row);
    return publicUser(row);
  },
  setPassword: async (id, password) => {
    const { salt, hash } = await hashPassword(password);
    stmts.setPw.run(hash, salt, id);
  },
  setUserChainletter: (id, { tokenUrl, enabled, claim }) =>
    stmts.setUserCl.run(tokenUrl || '', enabled ? 1 : 0, claim ? JSON.stringify(claim) : null, id),
  setUserClaim: (id, claim) => stmts.setUserClaimStmt.run(claim ? JSON.stringify(claim) : null, id),
  setUserConfig: (id, json) => stmts.setUserConfigStmt.run(json, id),
  setUserProfiles: (id, json) => stmts.setUserProfilesStmt.run(json, id),

  // --- board archiving ---
  // Archive all active cards, or only those with a given status (e.g. 'reject').
  archiveBoard: (ownerId, comment, status) => {
    const iter = (stmts.maxIter.get(ownerId)?.m || 0) + 1;
    const now = new Date().toISOString();
    const params = { iter, comment: comment || '', now, owner: ownerId };
    const info = status
      ? stmts.archiveActiveStatus.run({ ...params, status })
      : stmts.archiveActive.run(params);
    return { iteration: iter, count: info.changes };
  },
  listArchives: (ownerId) => stmts.listArch.all(ownerId),
  restoreArchive: (ownerId, iteration) => stmts.restoreArch.run(ownerId, iteration).changes,
  updateScores: (row) => stmts.updateScores.run(row),
  rescoreRow: (row) => stmts.rescoreRow.run(row),
  setStatus: (id, status, now) => stmts.updateStatus.run(status, now, id),
  setSummary: (id, summary, now) => stmts.updateSummary.run(summary, now, id),
  setTriage: (id, triageJson, now) => stmts.updateTriage.run(triageJson, now, id),
  setExtract: (id, extractJson, now) => stmts.updateExtract.run(extractJson, now, id),
  setCertification: (id, cid, resultJson, now) => stmts.updateCert.run(cid, now, resultJson, now, id),
  setArchiveZip: (sourceFile, zip, now, ownerId) => stmts.setArchive.run(zip, now, sourceFile, ownerId),
  remove: (id) => stmts.del.run(id),
  count: () => stmts.count.get().n,
};

export default repo;
