// Runtime feature flags resolved from the environment.

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());
}
function falsy(v) {
  return ['0', 'false', 'no', 'off'].includes(String(v ?? '').trim().toLowerCase());
}

/**
 * Self-registration policy. Open in development for convenience; in production it
 * is CLOSED by default (a public server should not let anonymous visitors create
 * accounts) unless the operator explicitly sets QQ_ALLOW_REGISTRATION=1.
 */
export function registrationOpen() {
  const v = process.env.QQ_ALLOW_REGISTRATION;
  if (truthy(v)) return true;
  if (falsy(v)) return false;
  return process.env.NODE_ENV !== 'production';
}
