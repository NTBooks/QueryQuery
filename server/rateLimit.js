// Minimal in-memory fixed-window rate limiter (no external deps). Keyed by client
// IP (honors Express's `trust proxy`). Each limiter keeps its own bucket map, so
// e.g. /login and /register count independently. Single-process only — for a
// multi-instance deployment, front the app with a shared store / proxy limiter.
export function rateLimit({ windowMs, max, message = 'Too many requests. Please slow down and try again later.', key }) {
  const buckets = new Map(); // key -> { count, resetAt }
  const keyFn = typeof key === 'function' ? key : (req) => req.ip || req.socket?.remoteAddress || 'unknown';

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  if (sweeper.unref) sweeper.unref(); // don't keep the process alive

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = keyFn(req);
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.set('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

export default rateLimit;
