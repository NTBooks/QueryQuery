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

export default db;
