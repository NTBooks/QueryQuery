#!/usr/bin/env node
// QueryQuery server bootstrap: init DB, mount API, serve the built client,
// pick a free port, and open the browser.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import open from 'open';
import getPort, { portNumbers } from 'get-port';

import { ROOT, getConfig } from './configStore.js';
import './db.js'; // runs migration on import
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
import { startWatcher } from './services/watcher.js';
import { getRevision } from './services/revision.js';

const isDev = process.env.NODE_ENV === 'development';

const app = express();
app.use(express.json({ limit: '25mb' }));

// Public endpoints.
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter); // login/register public; /me + /password require auth internally

// Everything below requires a logged-in user.
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/meta', requireAuth, metaRouter);
app.use('/api/config', requireAuth, configRouter);
app.use('/api/tickets', requireAuth, ticketsRouter);
app.use('/api/ingest', requireAuth, ingestRouter);
app.use('/api/analyze', requireAuth, analyzeRouter);
app.use('/api/inbox', requireAuth, inboxRouter);
app.use('/api/chainletter', requireAuth, chainletterRouter);
app.use('/api/llm', requireAuth, llmRouter);
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
