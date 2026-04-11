// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /auth router.
//
// Register:
//   • Requires first/last name + password
//   • Requires at least one of email / mobile (mirrors the UDF rule)
//   • Only 'student' / 'instructor' roles may self-register (UDF gate)
//
// Login:
//   • `identifier` is either an email or a mobile string — we don't
//     split it; the UDF handles the dual lookup.
//
// Refresh:
//   • Body carries the refresh token. The cookie-based variant can
//     be added later without breaking this schema.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  emailSchema,
  mobileSchema,
  nameSchema,
  passwordSchema
} from '../../shared/validation/common';

// ─── Register ────────────────────────────────────────────────────

export const registerBodySchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema.optional(),
    mobile: mobileSchema.optional(),
    password: passwordSchema,
    roleCode: z
      .enum(['student', 'instructor'], {
        invalid_type_error: 'roleCode must be "student" or "instructor"',
        required_error: 'roleCode is required'
      })
      .default('student'),
    countryId: z.coerce.number().int().positive().default(1)
  })
  .refine((v) => !!v.email || !!v.mobile, {
    message: 'At least one of email or mobile is required',
    path: ['email']
  });

export type RegisterBody = z.infer<typeof registerBodySchema>;

// ─── Login ───────────────────────────────────────────────────────

/**
 * Identifier is loose on purpose — it can be either an email or a
 * mobile. We still normalize: trimmed, lower-cased (emails are
 * CITEXT so case doesn't matter, but it keeps inputs canonical).
 */
const identifierSchema = z
  .string()
  .trim()
  .min(3, 'identifier is too short')
  .max(254, 'identifier is too long')
  .transform((v) => v.toLowerCase());

export const loginBodySchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'password is required').max(128)
});

export type LoginBody = z.infer<typeof loginBodySchema>;

// ─── Refresh ─────────────────────────────────────────────────────

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken is required')
});

export type RefreshBody = z.infer<typeof refreshBodySchema>;
