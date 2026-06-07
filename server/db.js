// SQLite connection + schema migration (better-sqlite3, synchronous).
import Database from 'better-sqlite3';
import { DB_PATH, migrateLegacy } from '../paths.js';

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

export default db;
