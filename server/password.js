// Password hashing (scrypt + per-user salt) and id generation. No DB deps.
// Hashing runs OFF the event loop (async crypto.scrypt) so a burst of logins or
// registrations can't block the single-threaded server. A small semaphore caps
// how many scrypt operations run at once, bounding peak memory (~32MB each).
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 32;

export function genId() {
  return crypto.randomUUID();
}

/** A random, URL-safe password — used to seed the first admin on a fresh install. */
export function genPassword(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// --- Concurrency cap: at most MAX_CONCURRENT scrypt ops in flight; the rest queue. ---
const MAX_CONCURRENT = 4;
let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}
function release() {
  const next = waiters.shift();
  if (next) next(); // hand the slot straight to the next waiter (active stays put)
  else active -= 1;
}
async function withLimit(fn) {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Hash a plaintext password (async, off the event loop). Returns { salt, hash } (hex). */
export async function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const buf = await withLimit(() => scrypt(String(plain), salt, KEYLEN));
  return { salt, hash: buf.toString('hex') };
}

/** Constant-time verify of a plaintext password (async, off the event loop). */
export async function verifyPassword(plain, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  try {
    const got = await withLimit(() => scrypt(String(plain), salt, KEYLEN));
    const exp = Buffer.from(expectedHash, 'hex');
    return got.length === exp.length && crypto.timingSafeEqual(got, exp);
  } catch {
    return false;
  }
}

// --- Synchronous variants: ONLY for startup (seeding the first admin, the
//     default-admin safety check). Never call these on a request path. ---

export function hashPasswordSync(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPasswordSync(plain, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const got = crypto.scryptSync(String(plain), salt, KEYLEN);
  const exp = Buffer.from(expectedHash, 'hex');
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}
