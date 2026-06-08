#!/usr/bin/env node
// QueryQuery server bootstrap: init DB, mount API, serve the built client,
// pick a free port, and open the browser.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import open from 'open';
import getPort, { portNumbers } from 'get-port';

import { ROOT, getConfig } from './configStore.js';
import './db.js'; // runs migration + first-run admin seed on import
import repo from './repo.js';
import { verifyPasswordSync } from './password.js';
import metaRouter from './routes/meta.js';
import configRouter from './routes/config.js';
import ticketsRouter from './routes/tickets.js';
import ingestRouter from './routes/ingest.js';
import analyzeRouter from './routes/analyze.js';
import inboxRouter from './routes/inbox.js';
import chainletterRouter from './routes/chainletter.js';
import llmRouter from './routes/llm.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { requireAuth } from './auth.js';
import securityHeaders from './securityHeaders.js';
import { startWatcher } from './services/watcher.js';
import { getRevision } from './services/revision.js';

const isDev = process.env.NODE_ENV === 'development';

const app = express();
app.disable('x-powered-by');

// Behind a reverse proxy (the documented Coolify/Docker deploy) so req.ip / rate
// limiting use the real client IP, not the proxy's. Override with TRUST_PROXY
// (a hop count, or true/false). Default: trust one hop in production, none in dev.
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv !== undefined) {
  const n = Number(trustProxyEnv);
  app.set('trust proxy', Number.isFinite(n) ? n : trustProxyEnv === 'true');
} else if (!isDev) {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);

// Right-sized JSON body limits per route group (no blanket 25mb). Only the .eml
// upload route needs real headroom; auth bodies are tiny.
const authBody = express.json({ limit: '16kb' });
const tinyBody = express.json({ limit: '64kb' });
const stdBody = express.json({ limit: '1mb' });
const uploadBody = express.json({ limit: '25mb' });

// Fail closed in production if an existing admin still uses the default password.
function assertNoDefaultAdmin() {
  if (process.env.QQ_ALLOW_DEFAULT_ADMIN === '1') return;
  const admin = repo.getUserByUsername('admin');
  if (!admin || !verifyPasswordSync('admin', admin.pw_salt, admin.pw_hash)) return;
  const bar = '='.repeat(60);
  const msg = 'The "admin" account still uses the default password "admin".';
  if (!isDev) {
    console.error(`\n${bar}\n  SECURITY: ${msg}\n  Refusing to start in production. Change the password, or set\n  QQ_ALLOW_DEFAULT_ADMIN=1 to override (NOT recommended).\n${bar}\n`);
    process.exit(1);
  }
  console.warn(`  ⚠ SECURITY: ${msg} Change it before deploying.`);
}

// Public endpoints.
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authBody, authRouter); // login/register public; /me + /password require auth internally

// Everything below requires a logged-in user.
app.use('/api/users', requireAuth, tinyBody, usersRouter);
app.use('/api/meta', requireAuth, metaRouter);
app.use('/api/config', requireAuth, stdBody, configRouter);
app.use('/api/tickets', requireAuth, stdBody, ticketsRouter);
app.use('/api/ingest', requireAuth, tinyBody, ingestRouter);
app.use('/api/analyze', requireAuth, stdBody, analyzeRouter);
app.use('/api/inbox', requireAuth, uploadBody, inboxRouter);
app.use('/api/chainletter', requireAuth, tinyBody, chainletterRouter);
app.use('/api/llm', requireAuth, stdBody, llmRouter);
app.get('/api/revision', requireAuth, (req, res) => res.json({ rev: getRevision() }));

// Serve the built client (production). In dev, Vite serves it and proxies /api.
if (!isDev) {
  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('*', (req, res) =>
      res
        .status(503)
        .send('<h1>QueryQuery</h1><p>Client not built yet. Run <code>npm run build</code> (or <code>npm start</code>).</p>')
    );
  }
}

async function main() {
  assertNoDefaultAdmin(); // refuse to expose a default-credential admin in production
  getConfig(); // ensure config + folders exist
  startWatcher(); // auto-ingest .eml files dropped into the input folder
  const port = process.env.PORT
    ? Number(process.env.PORT)
    : await getPort({ port: portNumbers(4711, 4811) });

  app.listen(port, '0.0.0.0', () => {
    const url = `http://localhost:${port}`;
    console.log('\n  QueryQuery - literary slush-pile triage');
    console.log(`  Running at: ${url}`);
    console.log('  Drop .eml files in the input folder, then click "Scan Inbox".\n');
    // Only auto-open a browser for a local, interactive run — never in a container.
    const canOpen = !isDev && process.stdout.isTTY && process.env.QQ_NO_OPEN !== '1';
    if (canOpen) {
      open(url).catch(() => {
        console.log('  (Could not auto-open a browser - open the URL above manually.)');
      });
    }
  });
}

main().catch((err) => {
  console.error('Failed to start QueryQuery:', err);
  process.exit(1);
});
