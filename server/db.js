// SQLite connection + schema migration (better-sqlite3, synchronous).
import Database from 'better-sqlite3';
import { DB_PATH, migrateLegacy } from '../paths.js';
import { genId, hashPassword } from './password.js';

migrateLegacy(); // ensure PERSIST_DIR exists + bring forward any legacy db

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id            INTEGER PRIMARY KEY,
    source_file   TEXT UNIQUE,
    from_addr     TEXT,
    from_name     TEXT,
    subject       TEXT,
    received_at   TEXT,
    body          TEXT,
    components    TEXT,
    score         INTEGER,
    score_band    TEXT,
    breakdown     TEXT,
    ai_suspicion  INTEGER,
    ai_disclosed  INTEGER DEFAULT 0,
    cliche_score  INTEGER,
    status        TEXT DEFAULT 'did_not_review',
    llm_summary   TEXT,
    llm_triage    TEXT,
    config_hash   TEXT,
    created_at    TEXT,
    updated_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_band   ON tickets(score_band);
`);

// Migrations: columns added after the initial release.
const cols = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
if (!cols.includes('llm_extract')) {
  db.exec('ALTER TABLE tickets ADD COLUMN llm_extract TEXT');
}
if (!cols.includes('cl_cid')) {
  db.exec('ALTER TABLE tickets ADD COLUMN cl_cid TEXT');
  db.exec('ALTER TABLE tickets ADD COLUMN cl_stamped INTEGER DEFAULT 0');
  db.exec('ALTER TABLE tickets ADD COLUMN cl_stamped_at TEXT');
  db.exec('ALTER TABLE tickets ADD COLUMN cl_result TEXT');
}
if (!cols.includes('archive_zip')) {
  db.exec('ALTER TABLE tickets ADD COLUMN archive_zip TEXT');
}
// Multi-user: every ticket has an owner.
if (!cols.includes('owner_id')) {
  db.exec('ALTER TABLE tickets ADD COLUMN owner_id TEXT');
}
// Board archiving: tickets tagged with an iteration are tucked away (restorable).
if (!cols.includes('archived_iteration')) {
  db.exec('ALTER TABLE tickets ADD COLUMN archived_iteration INTEGER');
  db.exec('ALTER TABLE tickets ADD COLUMN archive_comment TEXT');
  db.exec('ALTER TABLE tickets ADD COLUMN archived_at TEXT');
}

// Users (multi-user accounts). Chainletter config is per-user (token + cached claim).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL,
    pw_hash      TEXT NOT NULL,
    pw_salt      TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'user',
    cl_token_url TEXT,
    cl_enabled   INTEGER DEFAULT 0,
    cl_claim     TEXT,
    created_at   TEXT NOT NULL
  );
`);

// Per-user scoring config ("what each person is looking for").
const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!ucols.includes('config')) db.exec('ALTER TABLE users ADD COLUMN config TEXT');

// Seed a default admin (admin / admin) on first run.
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
let adminId;
if (userCount === 0) {
  adminId = genId();
  const { salt, hash } = hashPassword('admin');
  db.prepare('INSERT INTO users (id, username, pw_hash, pw_salt, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(adminId, 'admin', hash, salt, 'admin', new Date().toISOString());
} else {
  adminId = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1").get()?.id;
}

// Backfill ownerless (pre-multi-user) tickets to the admin.
if (adminId) db.prepare('UPDATE tickets SET owner_id=? WHERE owner_id IS NULL').run(adminId);

// One-time rebuild: replace the GLOBAL `source_file UNIQUE` with a per-user
// UNIQUE(owner_id, source_file) so two users can import identical filenames.
const hasComposite = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='uniq_owner_source'").get();
if (!hasComposite) {
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE tickets_new (
        id INTEGER PRIMARY KEY,
        source_file TEXT,
        from_addr TEXT, from_name TEXT, subject TEXT, received_at TEXT, body TEXT,
        components TEXT, score INTEGER, score_band TEXT, breakdown TEXT,
        ai_suspicion INTEGER, ai_disclosed INTEGER DEFAULT 0, cliche_score INTEGER,
        status TEXT DEFAULT 'did_not_review', llm_summary TEXT, llm_triage TEXT,
        config_hash TEXT, created_at TEXT, updated_at TEXT, llm_extract TEXT,
        cl_cid TEXT, cl_stamped INTEGER DEFAULT 0, cl_stamped_at TEXT, cl_result TEXT,
        archive_zip TEXT, owner_id TEXT,
        archived_iteration INTEGER, archive_comment TEXT, archived_at TEXT
      );
    `);
    db.exec(`
      INSERT INTO tickets_new
        (id, source_file, from_addr, from_name, subject, received_at, body, components, score, score_band, breakdown,
         ai_suspicion, ai_disclosed, cliche_score, status, llm_summary, llm_triage, config_hash, created_at, updated_at,
         llm_extract, cl_cid, cl_stamped, cl_stamped_at, cl_result, archive_zip, owner_id, archived_iteration, archive_comment, archived_at)
      SELECT
        id, source_file, from_addr, from_name, subject, received_at, body, components, score, score_band, breakdown,
        ai_suspicion, ai_disclosed, cliche_score, status, llm_summary, llm_triage, config_hash, created_at, updated_at,
        llm_extract, cl_cid, cl_stamped, cl_stamped_at, cl_result, archive_zip, owner_id, archived_iteration, archive_comment, archived_at
      FROM tickets;
    `);
    db.exec('DROP TABLE tickets;');
    db.exec('ALTER TABLE tickets_new RENAME TO tickets;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_band ON tickets(score_band);');
    db.exec('CREATE UNIQUE INDEX uniq_owner_source ON tickets(owner_id, source_file);');
  });
  rebuild();
}

export default db;
