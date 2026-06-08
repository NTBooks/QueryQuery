// SQLite connection + schema migration. Uses Node's built-in node:sqlite
// (synchronous) — no native module, no compile step. Requires Node >= 22.13.
// The run scripts pass --disable-warning=ExperimentalWarning to mute node:sqlite's
// one-time experimental notice (it fires at builtin-link time, before user code).
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, migrateLegacy } from '../paths.js';
import { genId, hashPasswordSync, genPassword } from './password.js';

migrateLegacy(); // ensure PERSIST_DIR exists + bring forward any legacy db

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

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
// Named scoring profiles: JSON { active, profiles: { name -> config } }. Lazily
// seeded from the legacy `config` column on first access (see configStore.js).
if (!ucols.includes('profiles')) db.exec('ALTER TABLE users ADD COLUMN profiles TEXT');

// Seed the first admin on a fresh install. The password is taken from
// ADMIN_PASSWORD if set, otherwise generated randomly and printed ONCE to the
// logs below — there is no hard-coded default credential.
export let seededAdmin = null; // { username, password, fromEnv } only on the run that creates it

function printAdminBanner({ username, password, fromEnv }) {
  const bar = '='.repeat(60);
  const lines = [`\n${bar}`, '  QueryQuery - first-run admin account created'];
  if (fromEnv) {
    lines.push(`  Username: ${username}  (password taken from ADMIN_PASSWORD)`);
  } else {
    lines.push(
      '  Save these credentials now - they are shown only once:',
      '',
      `      username:  ${username}`,
      `      password:  ${password}`,
      '',
      '  Sign in, then change it under Account > Change password.',
      '  (Set ADMIN_PASSWORD before first run to choose your own.)'
    );
  }
  lines.push(bar, '');
  console.log(lines.join('\n'));
}

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
let adminId;
if (userCount === 0) {
  adminId = genId();
  const username = (process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
  const envPw = process.env.ADMIN_PASSWORD;
  const fromEnv = !!(envPw && envPw.length);
  const password = fromEnv ? envPw : genPassword();
  const { salt, hash } = hashPasswordSync(password);
  db.prepare('INSERT INTO users (id, username, pw_hash, pw_salt, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(adminId, username, hash, salt, 'admin', new Date().toISOString());
  seededAdmin = { username, password, fromEnv };
  printAdminBanner(seededAdmin);
} else {
  adminId = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1").get()?.id;
}

// Backfill ownerless (pre-multi-user) tickets to the admin.
if (adminId) db.prepare('UPDATE tickets SET owner_id=? WHERE owner_id IS NULL').run(adminId);

// One-time rebuild: replace the GLOBAL `source_file UNIQUE` with a per-user
// UNIQUE(owner_id, source_file) so two users can import identical filenames.
const hasComposite = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='uniq_owner_source'").get();
if (!hasComposite) {
  db.exec('BEGIN');
  try {
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
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export default db;
