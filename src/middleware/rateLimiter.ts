/**
 * Per-Endpoint Rate Limiters
 * ──────────────────────────
 * Stricter rate limits for sensitive endpoints (auth, OTP, checkout).
 * Uses express-rate-limit with IP-based keying.
 * The global limiter in app.ts (1000/15min) remains as a catch-all.
 */

import rateLimit from 'express-rate-limit';

/**
 * Auth endpoints: login, register, forgot-password
 * 10 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again in 15 minutes.' },
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
  message: { success: false, error: 'Too many OTP attempts. Please try again in 10 minutes.' },
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
  message: { success: false, error: 'Too many password reset attempts. Please try again later.' },
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
  message: { success: false, error: 'Too many checkout attempts. Please try again later.' },
});
