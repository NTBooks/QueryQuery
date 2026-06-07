// Copy generated sample .eml files from samples/ into input/ for a quick demo.
// Usage: node scripts/seed-input.js [count]   (default: copy all)
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES_DIR, INPUT_DIR, ensureDir } from './eml-utils.js';

function main() {
  ensureDir(INPUT_DIR);
  let files;
  try {
    files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.eml'));
  } catch {
    files = [];
  }
  if (!files.length) {
    console.error('\n  No samples found. Run `npm run gen-samples` (and optionally `npm run scrape`) first.\n');
    process.exit(0);
  }

  const count = process.argv[2] ? Number(process.argv[2]) : files.length;
  const chosen = count >= files.length ? files : files.sort(() => Math.random() - 0.5).slice(0, count);

  // Clear existing .eml in input first.
  for (const f of fs.readdirSync(INPUT_DIR)) {
    if (f.endsWith('.eml')) fs.rmSync(path.join(INPUT_DIR, f));
  }
  for (const f of chosen) {
    fs.copyFileSync(path.join(SAMPLES_DIR, f), path.join(INPUT_DIR, f));
  }
  console.log(`\n  Copied ${chosen.length} .eml file(s) into input/. Run the app and click "Scan Inbox".\n`);
}

main();
