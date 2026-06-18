/**
 * Per-Endpoint Rate Limiters
 * ──────────────────────────
 * Stricter rate limits for sensitive endpoints (auth, OTP, checkout).
 * Uses express-rate-limit with IP-based keying.
 * The global limiter in app.ts (1000/15min) remains as a catch-all.
 */

import rateLimit from 'express-rate-limit';
import { RedisRateLimitStore } from './redisRateLimitStore';
import { config } from '../config';

/**
 * Auth endpoints: login, register, forgot-password
 * 10 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.rateLimit.disabled,
  message: { success: false, error: 'Too many attempts. Please try again in 15 minutes.' },
  store: new RedisRateLimitStore('auth'),
});

/**
 * OTP endpoints: verify-otp, resend-otp, verify-reset-otp, resend-reset-otp
 * 5 attempts per 10 minutes per IP
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.rateLimit.disabled,
  message: { success: false, error: 'Too many OTP attempts. Please try again in 10 minutes.' },
  store: new RedisRateLimitStore('otp'),
});

/**
 * Password reset: reset-password
 * 5 attempts per 15 minutes per IP
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.rateLimit.disabled,
  message: { success: false, error: 'Too many password reset attempts. Please try again later.' },
  store: new RedisRateLimitStore('pwreset'),
});

/**
 * Checkout endpoints: initiate, verify, refund
 * 20 attempts per 15 minutes per IP
 */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.rateLimit.disabled,
  message: { success: false, error: 'Too many checkout attempts. Please try again later.' },
  store: new RedisRateLimitStore('checkout'),
});

/**
 * Public certificate verify endpoint: GET /verify/cert/:cert_number
 * Cert numbers are higher-entropy than resume slugs so a slightly more
 * permissive limit is acceptable. 60 req/min per IP.
 */
export const publicVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.rateLimit.disabled,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  store: new RedisRateLimitStore('pubverify'),
});

/**
 * Phase 11.5.3 — Public fuzzy-search endpoints.
 * Each request hits a trigram index (cheap) but the endpoint is unauthenticated
 * so bots will hammer it. 90 req/min per IP keeps a real keystroke-driven UX
 * smooth (≈1.5 req/sec) while choking off scrapers.
 */
export const publicSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.rateLimit.disabled,
  message: { success: false, error: 'Too many search requests. Please slow down.' },
  store: new RedisRateLimitStore('pubsearch'),
});
