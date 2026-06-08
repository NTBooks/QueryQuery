// Password hashing (scrypt + per-user salt) and id generation. No DB deps.
import crypto from 'node:crypto';

export function genId() {
  return crypto.randomUUID();
}

/** Hash a plaintext password. Returns { salt, hash } (both hex). */
export function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return { salt, hash };
}

/** Constant-time verify of a plaintext password against a stored salt+hash. */
export function verifyPassword(plain, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const got = crypto.scryptSync(String(plain), salt, 32);
  const exp = Buffer.from(expectedHash, 'hex');
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}
