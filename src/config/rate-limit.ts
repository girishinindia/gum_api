import rateLimit from 'express-rate-limit';

import { env } from './env';

// ─── Rate Limit Configurations ───────────────────────────────
// Two profiles: a generous global limiter for most routes, and
// a stricter limiter for auth endpoints to slow brute-force.
// Both use the in-memory store for now; swap to a Redis store
// once horizontal scaling is required.
//
// Test-run bypass: when `process.env.SKIP_GLOBAL_RATE_LIMIT === '1'`,
// the global limiter is a no-op. End-to-end verify scripts (which
// fire hundreds of requests in < 30 s) flip this flag before
// importing buildApp so they can exercise real routes without
// tripping production rate limits. Never set this in prod.

const shouldSkipGlobalLimit = (): boolean =>
  process.env.SKIP_GLOBAL_RATE_LIMIT === '1';

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => shouldSkipGlobalLimit(),
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => shouldSkipGlobalLimit(),
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});
