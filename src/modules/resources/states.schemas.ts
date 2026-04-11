// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/states router (phase 02).
//
// Mirrors countries.schemas.ts: the DB UDFs already enforce their
// own validation (`udf_states_insert`, `udf_states_update`,
// `udf_getstates`) — these schemas exist so the API rejects bad
// input loudly with 400 VALIDATION_ERROR before the request ever
// reaches PostgreSQL.
//
// The list function `udf_getstates` joins states → countries via
// `uv_states`, so both state- and country-level filters are exposed
// on the query string.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const iso3Schema = z
  .string()
  .trim()
  .length(3, 'iso3 must be exactly 3 characters')
  .regex(/^[A-Za-z]{3}$/, 'iso3 must be alphabetic')
  .transform((v) => v.toUpperCase());

const nameSchema = z
  .string()
  .trim()
  .min(2, 'name is too short')
  .max(128, 'name is too long');

const websiteSchema = z
  .string()
  .trim()
  .min(4, 'website is too short')
  .max(255, 'website is too long');

/** JSONB `languages` array — short list of human-readable language names. */
const languagesSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(20, 'languages array is too long');

// ─── Sort allowlist ──────────────────────────────────────────────
//
// `udf_getstates` splits sorting by table: `p_sort_table` chooses
// between state-level and country-level columns, then `p_sort_column`
// picks one of the whitelisted keys for that table. The API exposes
// both as separate query params so the frontend can do things like
// "sort states list by parent country name, DESC".

export const STATE_SORT_TABLES = ['state', 'country'] as const;

export const STATE_SORT_COLUMNS = [
  'id',
  'name',
  'iso3',        // country only
  'is_active',
  'is_deleted'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listStatesQuerySchema = paginationSchema.extend({
  // State-level active flag (top-level convenience, matches countries).
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),

  // Explicit parent-country flags (separate from `isActive` so callers
  // can independently filter on state.is_active vs country.is_active).
  countryIsActive: queryBooleanSchema.optional(),
  countryIsDeleted: queryBooleanSchema.optional(),
  stateIsActive: queryBooleanSchema.optional(),
  stateIsDeleted: queryBooleanSchema.optional(),

  // Parent-country filter by iso3 (exact match, upper-case normalized).
  countryIso3: iso3Schema.optional(),

  // JSONB containment filters — single value match against the
  // `languages` array on either the country or the state side.
  countryLanguage: z.string().trim().min(2).max(64).optional(),
  stateLanguage: z.string().trim().min(2).max(64).optional(),

  searchTerm: searchTermSchema,

  sortTable: z.enum(STATE_SORT_TABLES).default('state'),
  sortColumn: z.enum(STATE_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListStatesQuery = z.infer<typeof listStatesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createStateBodySchema = z.object({
  countryId: bigintIdSchema,
  name: nameSchema,
  languages: languagesSchema.optional(),
  website: websiteSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateStateBody = z.infer<typeof createStateBodySchema>;

// ─── Update body ─────────────────────────────────────────────────
//
// Every field is optional on update; .refine prevents empty `{}`
// payloads (which would otherwise round-trip as a no-op UPDATE
// touching only `updated_at`).

export const updateStateBodySchema = z
  .object({
    countryId: bigintIdSchema.optional(),
    name: nameSchema.optional(),
    languages: languagesSchema.optional(),
    website: websiteSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateStateBody = z.infer<typeof updateStateBodySchema>;
