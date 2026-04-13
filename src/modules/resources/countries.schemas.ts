// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/countries router.
//
// The DB UDFs already do their own validation; these schemas exist
// so the API rejects bad input loudly with 400 VALIDATION_ERROR
// before the request ever reaches PostgreSQL. Atoms come from
// shared/validation/common where possible.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const iso2Schema = z
  .string()
  .trim()
  .length(2, 'iso2 must be exactly 2 characters')
  .regex(/^[A-Za-z]{2}$/, 'iso2 must be alphabetic')
  .transform((v) => v.toUpperCase());

const iso3Schema = z
  .string()
  .trim()
  .length(3, 'iso3 must be exactly 3 characters')
  .regex(/^[A-Za-z]{3}$/, 'iso3 must be alphabetic')
  .transform((v) => v.toUpperCase());

const phoneCodeSchema = z
  .preprocess(
    (v) => (typeof v === 'number' ? String(v) : v),
    z
      .string()
      .trim()
      .min(2, 'phoneCode is too short')
      .max(8, 'phoneCode is too long')
      .regex(/^\+?[0-9]{1,7}$/, 'phoneCode must be a + followed by digits')
  );

/** A list of human-readable language names; the DB stores it as JSONB. */
const languagesSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(20, 'languages array is too long');

// ─── Sort allowlist ──────────────────────────────────────────────

export const COUNTRY_SORT_COLUMNS = [
  'id',
  'name',
  'iso2',
  'iso3',
  'phone_code',
  'currency',
  'nationality',
  'national_language',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

const sortColumnSchema = z
  .enum(COUNTRY_SORT_COLUMNS)
  .default('id');

// ─── List query ──────────────────────────────────────────────────

export const listCountriesQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  iso2: iso2Schema.optional(),
  iso3: iso3Schema.optional(),
  phoneCode: phoneCodeSchema.optional(),
  currency: z.string().trim().min(2).max(8).optional(),
  nationality: z.string().trim().min(2).max(64).optional(),
  nationalLanguage: z.string().trim().min(2).max(64).optional(),
  language: z.string().trim().min(2).max(64).optional(),
  searchTerm: searchTermSchema,
  sortColumn: sortColumnSchema,
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCountriesQuery = z.infer<typeof listCountriesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createCountryBodySchema = z.object({
  name: z.string().trim().min(2, 'name is too short').max(128, 'name is too long'),
  iso2: iso2Schema,
  iso3: iso3Schema,
  phoneCode: phoneCodeSchema.optional(),
  currency: z.string().trim().min(2).max(8).optional(),
  currencyName: z.string().trim().min(2).max(64).optional(),
  currencySymbol: z.string().trim().min(1).max(8).optional(),
  nationalLanguage: z.string().trim().min(2).max(64).optional(),
  nationality: z.string().trim().min(2).max(64).optional(),
  languages: languagesSchema.optional(),
  tld: z.string().trim().min(2).max(16).optional(),
  isActive: z.boolean().optional()
});
export type CreateCountryBody = z.infer<typeof createCountryBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

/**
 * Every field is optional on update.
 *
 * NOTE: `flagImage` (a raw URL) is deliberately *not* here. The only
 * way to change a country's flag is by attaching a binary file to this
 * same PATCH request under the multipart form-data field `flag` (also
 * accepts aliases `flagImage`/`file`) — the handler + multer pipeline
 * then enforces WebP conversion, ISO3-based deterministic naming, and
 * delete-then-upload semantics on Bunny Storage. Accepting a raw URL
 * would let callers bypass all three invariants.
 *
 * The empty-body check used to live here as `.refine(Object.keys > 0)`
 * but has moved into the route handler so that a multipart PATCH that
 * contains only a flag file (no text fields) still validates.
 */
export const updateCountryBodySchema = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  iso2: iso2Schema.optional(),
  iso3: iso3Schema.optional(),
  phoneCode: phoneCodeSchema.optional(),
  currency: z.string().trim().min(2).max(8).optional(),
  currencyName: z.string().trim().min(2).max(64).optional(),
  currencySymbol: z.string().trim().min(1).max(8).optional(),
  nationalLanguage: z.string().trim().min(2).max(64).optional(),
  nationality: z.string().trim().min(2).max(64).optional(),
  languages: languagesSchema.optional(),
  tld: z.string().trim().min(2).max(16).optional(),
  isActive: z.boolean().optional()
});
export type UpdateCountryBody = z.infer<typeof updateCountryBodySchema>;
