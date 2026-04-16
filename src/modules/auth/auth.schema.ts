import { z } from 'zod';

export const registerSchema = z.object({
  first_name: z.string().min(1).max(75).trim(),
  last_name: z.string().min(1).max(75).trim(),
  email: z.string().email().max(255).trim().toLowerCase(),
  mobile: z.string().min(10).max(15).trim(),
  password: z.string().min(8).max(128),
});

export const verifyOtpSchema = z.object({
  pending_id: z.string().min(1),
  channel: z.enum(['email', 'mobile']),
  otp: z.string().length(6),
});

export const resendOtpSchema = z.object({
  pending_id: z.string().min(1),
  channel: z.enum(['email', 'mobile']),
});

export const loginSchema = z.object({
  identifier: z.string().min(1).trim(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refresh_token: z.string().min(1) });

// ── Forgot password flow ──
export const forgotPasswordSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  mobile: z.string().min(10).max(15).trim(),
});

export const verifyResetOtpSchema = z.object({
  reset_pending_id: z.string().min(1),
  channel: z.enum(['email', 'mobile']),
  otp: z.string().length(6),
});

export const resendResetOtpSchema = z.object({
  reset_pending_id: z.string().min(1),
  channel: z.enum(['email', 'mobile']),
});

export const resetPasswordSchema = z.object({
  reset_pending_id: z.string().min(1),
  new_password: z.string().min(8).max(128),
});
