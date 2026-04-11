// ═══════════════════════════════════════════════════════════════
// Zod schemas for the secondary auth flows added in Step 11.
//
// These cover the OTP-driven recovery / change / verification
// flows that the core /register + /login spine deferred:
//
//   • forgot-password    — public, dual-channel (email + mobile)
//   • reset-password     — authenticated, dual-channel (current user)
//   • verify-email       — authenticated, single-channel
//   • verify-mobile      — authenticated, single-channel
//   • change-email       — authenticated, OTP to *new* address
//   • change-mobile      — authenticated, OTP to *new* number
//
// Naming convention:
//   *InitiateBodySchema  → request body for the "request OTP" leg
//   *CompleteBodySchema  → request body for the "submit OTP" leg
//
// All numeric IDs are coerced from strings (Express body-parser
// already gives us the right shape, but Zod's coerce makes the
// schemas resilient if a client sends `"123"` instead of `123`).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  emailSchema,
  mobileSchema,
  passwordSchema
} from '../../shared/validation/common';

// ─── OTP atom (6-digit numeric string) ───────────────────────────

const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,8}$/, 'OTP code must be 4–8 digits');

// ─── Forgot password (public) ────────────────────────────────────

export const forgotPasswordInitiateBodySchema = z.object({
  email: emailSchema,
  mobile: mobileSchema
});
export type ForgotPasswordInitiateBody = z.infer<
  typeof forgotPasswordInitiateBodySchema
>;

export const forgotPasswordCompleteBodySchema = z.object({
  userId: bigintIdSchema,
  emailOtpId: bigintIdSchema,
  emailOtpCode: otpCodeSchema,
  mobileOtpId: bigintIdSchema,
  mobileOtpCode: otpCodeSchema,
  newPassword: passwordSchema
});
export type ForgotPasswordCompleteBody = z.infer<
  typeof forgotPasswordCompleteBodySchema
>;

// ─── Reset password (authenticated change-password) ──────────────

// Initiate has no body — the user id comes from the JWT.
export const resetPasswordCompleteBodySchema = z.object({
  emailOtpId: bigintIdSchema,
  emailOtpCode: otpCodeSchema,
  mobileOtpId: bigintIdSchema,
  mobileOtpCode: otpCodeSchema,
  newPassword: passwordSchema
});
export type ResetPasswordCompleteBody = z.infer<
  typeof resetPasswordCompleteBodySchema
>;

// ─── Verify email / mobile (re-verification, authenticated) ──────

// Initiate has no body. Complete carries the single OTP returned
// by the matching initiate call.
export const verifyContactCompleteBodySchema = z.object({
  otpId: bigintIdSchema,
  otpCode: otpCodeSchema
});
export type VerifyContactCompleteBody = z.infer<
  typeof verifyContactCompleteBodySchema
>;

// ─── Register-time verify (public, no JWT) ───────────────────────
//
// Shape matches /forgot-password/verify: the OTP row id plus the
// claimed user id (which must be bound to the row in the DB). Used
// by /auth/register/verify-email and /auth/register/verify-mobile.
// A freshly-registered user has no JWT yet — the OTP codes ARE the
// authentication.
export const registerVerifyBodySchema = z.object({
  userId: bigintIdSchema,
  otpId: bigintIdSchema,
  otpCode: otpCodeSchema
});
export type RegisterVerifyBody = z.infer<typeof registerVerifyBodySchema>;

// ─── Register-time resend (public, no JWT) ───────────────────────
//
// Public resend for a freshly-registered user whose initial OTP has
// expired or never arrived. Takes only the userId (no JWT yet). The
// server looks up the pending OTP for purpose='registration' on the
// requested channel and, if eligible per udf_otp_resend rules
// (3-min wait, max 3 resends), generates and dispatches a new code.
export const registerResendBodySchema = z.object({
  userId: bigintIdSchema
});
export type RegisterResendBody = z.infer<typeof registerResendBodySchema>;

// ─── Change email (authenticated) ────────────────────────────────

export const changeEmailInitiateBodySchema = z.object({
  newEmail: emailSchema
});
export type ChangeEmailInitiateBody = z.infer<
  typeof changeEmailInitiateBodySchema
>;

export const changeContactCompleteBodySchema = z.object({
  requestId: bigintIdSchema,
  otpId: bigintIdSchema,
  otpCode: otpCodeSchema
});
export type ChangeContactCompleteBody = z.infer<
  typeof changeContactCompleteBodySchema
>;

// ─── Change mobile (authenticated) ───────────────────────────────

export const changeMobileInitiateBodySchema = z.object({
  newMobile: mobileSchema
});
export type ChangeMobileInitiateBody = z.infer<
  typeof changeMobileInitiateBodySchema
>;
