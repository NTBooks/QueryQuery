// Helpers for writing valid .eml files (RFC822) via nodemailer's MailComposer.
import fs from 'node:fs';
import path from 'node:path';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { ROOT, SAMPLES_DIR, PERSIST_DIR } from '../paths.js';

export { ROOT, SAMPLES_DIR };
export const INPUT_DIR = path.join(PERSIST_DIR, 'input');

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function slugify(s, max = 50) {
  return String(s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'untitled';
}

/** Build a raw RFC822 message buffer. `headers` is an object of extra headers. */
export function buildEml({ from, to = 'Slush Agent <agent@queryquery.test>', subject, text, headers = {}, date }) {
  return new Promise((resolve, reject) => {
    const mc = new MailComposer({
      from,
      to,
      subject,
      text,
      date,
      headers,
    });
    mc.compile().build((err, message) => (err ? reject(err) : resolve(message)));
  });
}

/** Build + write one .eml to `dir`, returning the filename. */
export async function writeEml(dir, filename, opts) {
  ensureDir(dir);
  const msg = await buildEml(opts);
  const file = path.join(dir, filename.endsWith('.eml') ? filename : `${filename}.eml`);
  fs.writeFileSync(file, msg);
  return path.basename(file);
}

export function authorEmail(name) {
  return `${slugify(name, 30) || 'writer'}@example.com`;
}
