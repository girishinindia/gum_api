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
  .string()
  .trim()
  .min(2, 'phoneCode is too short')
  .max(8, 'phoneCode is too long')
  .regex(/^\+?[0-9]{1,7}$/, 'phoneCode must be a + followed by digits');

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
  flagImage: z.string().trim().min(1).max(255).optional(),
  isActive: z.boolean().optional()
});
export type CreateCountryBody = z.infer<typeof createCountryBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

/**
 * Every field is optional on update; .refine prevents empty `{}`
 * payloads (which would otherwise round-trip as a no-op UPDATE
 * touching only `updated_at`).
 *
 * NOTE: `flagImage` is deliberately *not* here. The only way to change
 * a country's flag is `POST /:id/flag`, which enforces WebP conversion,
 * ISO3-based deterministic naming, and delete-then-upload semantics on
 * Bunny Storage. Allowing a raw URL through PATCH would let callers
 * bypass all three invariants, so the field is rejected as an unknown
 * key by the route validator.
 */
export const updateCountryBodySchema = z
  .object({
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
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCountryBody = z.infer<typeof updateCountryBodySchema>;
