import rateLimit from 'express-rate-limit';

import { env } from '../../config/env';

// ─── General API Rate Limiter ───────────────────────────────
// Applied globally to all routes.

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// ─── Strict Auth Rate Limiter ───────────────────────────────
// Applied to sensitive auth endpoints: login, register, forgot-password,
// OTP initiate/resend. Much lower limit to prevent brute-force.

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});

// ─── OTP Resend Rate Limiter ────────────────────────────────
// Extra-strict for OTP resend endpoints to prevent SMS/email abuse.
// 5 requests per 15-minute window per IP.

export const otpResendRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after some time.',
    code: 'OTP_RATE_LIMIT_EXCEEDED'
  }
});
