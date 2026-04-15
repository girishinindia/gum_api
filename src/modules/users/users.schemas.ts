// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/users.
//
// Mirrors:
//   • udf_get_users
//   • udf_users_insert
//   • udf_users_update    ← email / mobile / password / role are
//                           BLOCKED at the UDF level — handled by
//                           dedicated auth flows in Step 11.
//   • udf_users_delete
//   • udf_users_restore
//
// Note: the API layer never accepts a password back from the wire
// in the user resource — passwords are write-only on insert and
// never echoed in any DTO (the DB view excludes the column).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  codeSchema,
  emailSchema,
  isDeletedFilterSchema,
  mobileSchema,
  nameSchema,
  paginationSchema,
  passwordSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ─────────────────────────────────────────────
// Must stay in sync with udf_get_users' whitelist.

export const USER_SORT_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'mobile',
  'is_active',
  'is_deleted',
  'is_email_verified',
  'is_mobile_verified',
  'created_at',
  'updated_at',
  'role_name',
  'role_code',
  'role_level',
  'country_name',
  'country_iso2',
  'country_phone_code',
  'country_nationality'
] as const;

const sortColumnSchema = z.enum(USER_SORT_COLUMNS).default('id');

const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('ASC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ─────────────────────────────────────────────────

export const listUsersQuerySchema = paginationSchema.extend({
  // user filters
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  isEmailVerified: queryBooleanSchema.optional(),
  isMobileVerified: queryBooleanSchema.optional(),

  // role filters
  roleId: bigintIdSchema.optional(),
  roleCode: codeSchema.optional(),
  roleLevel: z.coerce
    .number({ invalid_type_error: 'roleLevel must be a number' })
    .int('roleLevel must be an integer')
    .min(0, 'roleLevel must be ≥ 0')
    .max(99, 'roleLevel must be ≤ 99')
    .optional(),

  // country filters
  countryId: bigintIdSchema.optional(),
  countryIso2: z
    .string()
    .trim()
    .length(2, 'countryIso2 must be exactly 2 characters')
    .regex(/^[A-Za-z]{2}$/, 'countryIso2 must be 2 letters')
    .transform((v) => v.toUpperCase())
    .optional(),
  countryNationality: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .optional(),

  searchTerm: searchTermSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createUserBodySchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    password: passwordSchema,
    email: emailSchema.optional(),
    mobile: mobileSchema.optional(),
    roleId: bigintIdSchema.optional(),
    countryId: bigintIdSchema.optional(),
    isActive: z.boolean().optional(),
    isEmailVerified: z.boolean().optional(),
    isMobileVerified: z.boolean().optional()
  })
  .refine((v) => v.email !== undefined || v.mobile !== undefined, {
    message: 'At least one of email or mobile is required',
    path: ['email']
  });
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

// ─── Update body ────────────────────────────────────────────────
//
// Email, mobile, password, and role changes are intentionally
// absent — they live in dedicated auth flows in Step 11.
//
// At least one mutable field must be present so the operator gets
// a clean 400 instead of a no-op UDF call.

export const updateUserBodySchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    countryId: bigintIdSchema.optional(),
    isActive: z.boolean().optional(),
    isEmailVerified: z.boolean().optional(),
    isMobileVerified: z.boolean().optional()
  })
  .refine(
    (v) =>
      v.firstName !== undefined ||
      v.lastName !== undefined ||
      v.countryId !== undefined ||
      v.isActive !== undefined ||
      v.isEmailVerified !== undefined ||
      v.isMobileVerified !== undefined,
    { message: 'At least one mutable field must be provided' }
  );
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

// ─── Admin op: change role ──────────────────────────────────────
//
// Super-admin only. Calls udf_auth_change_role which enforces the
// hierarchy + role validity rules.

export const changeUserRoleBodySchema = z.object({
  roleId: bigintIdSchema
});
export type ChangeUserRoleBody = z.infer<typeof changeUserRoleBodySchema>;

// ─── Admin op: set verification flags ───────────────────────────
//
// Admin or super-admin (callers must outrank the target). At
// least one of the two flags must be present so the UDF doesn't
// short-circuit on a no-op.

export const setVerificationBodySchema = z
  .object({
    isEmailVerified: z.boolean().optional(),
    isMobileVerified: z.boolean().optional()
  })
  .refine(
    (v) => v.isEmailVerified !== undefined || v.isMobileVerified !== undefined,
    {
      message:
        'At least one of isEmailVerified or isMobileVerified is required'
    }
  );
export type SetVerificationBody = z.infer<typeof setVerificationBodySchema>;
