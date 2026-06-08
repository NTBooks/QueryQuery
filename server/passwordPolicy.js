// Centralized password policy for register / change / admin-reset. Login is NOT
// affected, so existing accounts keep working — only newly-set passwords must comply.
export const PASSWORD_MIN_LENGTH = 12;

// A tiny denylist of obviously-guessable choices. Not a full breach corpus (that
// would need a dependency); this just blocks the worst offenders.
const COMMON = new Set([
  'password', 'password1', 'password12', 'passw0rd123', 'passwordpassword',
  '123456789012', '1234567890', '111111111111', 'qwertyuiop12', 'qwerty123456',
  'letmein12345', 'iloveyou1234', 'adminadmin12', 'changemenow1',
  'administrator', 'welcome12345', 'queryquery12', 'queryquery123',
]);

/** Returns { ok:true } or { ok:false, error }. */
export function validatePassword(password, { username = '' } = {}) {
  const pw = String(password || '');
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (COMMON.has(pw.toLowerCase())) {
    return { ok: false, error: 'That password is too common. Choose something less guessable.' };
  }
  if (username && pw.toLowerCase() === String(username).toLowerCase()) {
    return { ok: false, error: 'Password must not be the same as your username.' };
  }
  return { ok: true };
}
