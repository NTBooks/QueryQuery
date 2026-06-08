// Security response headers (helmet-equivalent, no dependency). Covers
// clickjacking, MIME sniffing, referrer leakage, and a conservative CSP. HSTS is
// only emitted over HTTPS so a plain-HTTP dev run isn't pinned to TLS.
const CSP = [
  "default-src 'self'",
  "script-src 'self'", // Vite emits a single hashed module script — no inline JS
  "style-src 'self' 'unsafe-inline'", // Chakra/emotion inject inline styles
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'", // clickjacking
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

export default securityHeaders;
