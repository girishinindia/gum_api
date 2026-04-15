// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/cities router (phase 02).
//
// The DB UDFs (`udf_cities_insert`, `udf_cities_update`,
// `udf_getcities`) already do their own validation; these schemas
// exist so the API rejects bad input loudly with 400
// VALIDATION_ERROR before the request ever reaches PostgreSQL.
//
// The list function `udf_getcities` joins cities → states →
// countries via `uv_cities`, so the query string exposes filters
// for all three layers.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  isDeletedFilterSchema,
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

/** Local phone code — not the same as country phoneCode. E.g. '022' (Mumbai). */
const phoneCodeSchema = z
  .string()
  .trim()
  .min(2, 'phonecode is too short')
  .max(16, 'phonecode is too long')
  .regex(/^[0-9+\-() ]+$/, 'phonecode may only contain digits, +, -, parentheses and spaces');

/** IANA timezone id — e.g. 'Asia/Kolkata', 'America/Los_Angeles'. */
const timezoneSchema = z
  .string()
  .trim()
  .min(3, 'timezone is too short')
  .max(64, 'timezone is too long');

const websiteSchema = z
  .string()
  .trim()
  .min(4, 'website is too short')
  .max(255, 'website is too long');

// ─── Sort allowlist ──────────────────────────────────────────────

export const CITY_SORT_TABLES = ['city', 'state', 'country'] as const;

export const CITY_SORT_COLUMNS = [
  'id',
  'name',
  'iso3',        // country only
  'is_active',
  'is_deleted'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listCitiesQuerySchema = paginationSchema.extend({
  // Top-level convenience (maps to the city layer by default).
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),

  // Layer-specific flags — can be used independently of the top-level
  // `isActive` / `isDeleted`.
  countryIsActive: queryBooleanSchema.optional(),
  countryIsDeleted: isDeletedFilterSchema.optional(),
  stateIsActive: queryBooleanSchema.optional(),
  stateIsDeleted: isDeletedFilterSchema.optional(),
  cityIsActive: queryBooleanSchema.optional(),
  cityIsDeleted: isDeletedFilterSchema.optional(),

  // Country layer
  countryIso3: iso3Schema.optional(),
  countryLanguage: z.string().trim().min(2).max(64).optional(),

  // State layer
  stateLanguage: z.string().trim().min(2).max(64).optional(),

  // City layer
  cityTimezone: timezoneSchema.optional(),

  searchTerm: searchTermSchema,

  sortTable: z.enum(CITY_SORT_TABLES).default('city'),
  sortColumn: z.enum(CITY_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCitiesQuery = z.infer<typeof listCitiesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createCityBodySchema = z.object({
  stateId: bigintIdSchema,
  name: nameSchema,
  phoneCode: phoneCodeSchema.optional(),
  timezone: timezoneSchema.optional(),
  website: websiteSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateCityBody = z.infer<typeof createCityBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateCityBodySchema = z
  .object({
    stateId: bigintIdSchema.optional(),
    name: nameSchema.optional(),
    phoneCode: phoneCodeSchema.optional(),
    timezone: timezoneSchema.optional(),
    website: websiteSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCityBody = z.infer<typeof updateCityBodySchema>;
