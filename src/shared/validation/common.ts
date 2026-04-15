// ═══════════════════════════════════════════════════════════════
// Shared Zod atoms used across every route.
//
// Philosophy:
//   • The DB layer has its own safety clamps (see phase-01 UDFs).
//   • These schemas are the *user-facing contract*: they reject bad
//     input loudly with 400 VALIDATION_ERROR so the frontend can
//     render actionable messages.
//   • Keep the atoms small and composable. Route-specific schemas
//     should `.extend()` or `.merge()` these instead of re-defining.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Numeric helpers ────────────────────────────────────────────

/**
 * Coerce a string/number into a positive BIGINT-compatible integer.
 * Used for path params (`/:id`) and any body field that references
 * a database BIGINT primary key.
 */
export const bigintIdSchema = z
  .coerce.number({ invalid_type_error: 'must be a number' })
  .int('must be an integer')
  .positive('must be positive')
  .max(Number.MAX_SAFE_INTEGER, 'id is out of safe integer range');

/** `{ id: number }` — the canonical path-param shape for /:id routes */
export const idParamSchema = z.object({
  id: bigintIdSchema
});
export type IdParam = z.infer<typeof idParamSchema>;

// ─── Pagination ─────────────────────────────────────────────────

/**
 * Standard pagination schema. Mirrors the DB clamp ([1..100]) so the
 * API layer rejects oversized requests with a clear 400 before they
 * ever reach PostgreSQL.
 *
 * Applied to query strings — all query params are strings in Express,
 * so `z.coerce.number` is required.
 */
export const paginationSchema = z.object({
  pageIndex: z.coerce
    .number({ invalid_type_error: 'pageIndex must be a number' })
    .int('pageIndex must be an integer')
    .min(1, 'pageIndex must be ≥ 1')
    .default(1),
  pageSize: z.coerce
    .number({ invalid_type_error: 'pageSize must be a number' })
    .int('pageSize must be an integer')
    .min(1, 'pageSize must be ≥ 1')
    .max(100, 'pageSize must be ≤ 100')
    .default(20)
});
export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Wider pagination for audit-style endpoints (password history, login
 * attempts when operators are investigating incidents). Matches the
 * wider DB clamp in phase-01/11-password-history.
 */
export const paginationAuditSchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50)
});
export type PaginationAudit = z.infer<typeof paginationAuditSchema>;

// ─── Sorting ────────────────────────────────────────────────────

/**
 * Case-insensitive asc/desc sort direction. The DB functions also
 * whitelist this, but rejecting junk at the edge gives a cleaner error.
 */
export const sortDirectionSchema = z
  .union([z.literal('asc'), z.literal('desc'), z.literal('ASC'), z.literal('DESC')])
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
  .default('DESC');

/**
 * Generic sort schema. Route modules should `.merge()` this and
 * refine `sortColumn` to a per-route allowlist.
 */
export const sortSchema = z.object({
  sortColumn: z.string().trim().min(1).max(64).optional(),
  sortDirection: sortDirectionSchema
});
export type Sort = z.infer<typeof sortSchema>;

// ─── Primitive refiners ─────────────────────────────────────────

/**
 * Email — trimmed + lower-cased, RFC 5321 length cap.
 * Lower-casing matches the CITEXT normalization in the users table.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(3, 'email is too short')
  .max(254, 'email is too long')
  .email('must be a valid email address')
  .transform((v) => v.toLowerCase());

/**
 * E.164-ish mobile number — digits, optional leading '+', 8–20 chars.
 * Intentionally liberal; tightening should happen in a country-specific
 * layer if we ever need strict validation.
 */
export const mobileSchema = z
  .string()
  .trim()
  .min(8, 'mobile is too short')
  .max(20, 'mobile is too long')
  .regex(/^\+?[0-9]{8,19}$/, 'must be a valid mobile number');

/**
 * Password strength: 8–128 chars, at least one upper, one lower, one
 * digit. Special-char rules are intentionally *not* enforced here —
 * NIST 800-63B explicitly recommends against them. Length does the
 * real work.
 */
export const passwordSchema = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(128, 'password must be at most 128 characters')
  .regex(/[a-z]/, 'password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'password must contain at least one digit');

/** First / last name — trimmed, 1–128 chars, no control chars. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'must not be empty')
  .max(128, 'must be at most 128 characters')
  .regex(/^[^\x00-\x1f]+$/, 'must not contain control characters');

/**
 * Code field (role.code, permission.code, country.code) — lowercase
 * slug-ish, 2–64 chars, letters/digits/underscore/dot only. Matches
 * the check constraints used in phase-01 tables.
 */
export const codeSchema = z
  .string()
  .trim()
  .min(2, 'code must be at least 2 characters')
  .max(64, 'code must be at most 64 characters')
  .regex(/^[a-z0-9_.]+$/, 'code must be lowercase alphanumerics, dot or underscore');

/** Optional free-text search term — trimmed, ≤128 chars, empty → undefined. */
export const searchTermSchema = z
  .string()
  .trim()
  .max(128, 'search term must be at most 128 characters')
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/**
 * Query-string boolean coercer — accepts 'true', 'false', '1', '0',
 * 'yes', 'no' (case-insensitive). Real booleans pass through.
 */
export const queryBooleanSchema = z
  .union([z.boolean(), z.string()])
  .transform((v, ctx) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'must be a boolean (true|false|1|0|yes|no)'
    });
    return z.NEVER;
  });

/**
 * Tri-state filter for the soft-delete `isDeleted` query param.
 *
 * Accepted inputs (case-insensitive):
 *   true|1|yes   → only soft-deleted rows
 *   false|0|no   → only live rows
 *   all          → live + deleted (no is_deleted filter)
 *
 * Behaviour combined with `gateSoftDeleteFilters` middleware:
 *   - non-super-admin callers never reach this schema with the param
 *     present (it's stripped upstream)
 *   - super-admin callers without an `isDeleted` query param have
 *     `'all'` injected by the middleware so the default list view
 *     surfaces both live and deleted rows
 */
export type IsDeletedFilter = boolean | 'all';
export const isDeletedFilterSchema = z
  .union([z.boolean(), z.string()])
  .transform((v, ctx): IsDeletedFilter => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
    if (s === 'all') return 'all';
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'must be true|false|all (or 1|0|yes|no)'
    });
    return z.NEVER;
  });

/** ISO-8601 datetime string, coerced to a JS Date. */
export const dateIsoSchema = z
  .string()
  .datetime({ message: 'must be an ISO-8601 datetime' })
  .transform((v) => new Date(v));

// ─── Response envelope types (shared with handlers) ────────────

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiPaginated<T> extends ApiSuccess<T[]> {
  meta: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
  details?: unknown;
}
