// Runtime feature flags resolved from the environment.

function falsy(v) {
  return ['0', 'false', 'no', 'off'].includes(String(v ?? '').trim().toLowerCase());
}

/**
 * Self-registration policy. Open by default (anyone can create an account) — set
 * QQ_ALLOW_REGISTRATION=0 (or false/no/off) to close it. Account creation is still
 * rate-limited per IP (see routes/auth.js) to blunt scripted abuse.
 */
export function registrationOpen() {
  return !falsy(process.env.QQ_ALLOW_REGISTRATION);
}
