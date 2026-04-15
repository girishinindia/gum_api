// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/languages router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');

/** ISO 639-1 — two letters. Normalised to lowercase to match the seed data. */
const isoCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .regex(/^[A-Za-z-]+$/, 'iso_code must be alphabetic (may contain hyphens for variants)')
  .transform((v) => v.toLowerCase());

const nativeNameSchema = z.string().trim().min(1).max(128);
const scriptSchema = z.string().trim().min(2).max(64);

// ─── Sort allowlist ──────────────────────────────────────────────

export const LANGUAGE_SORT_COLUMNS = [
  'id',
  'name',
  'iso_code',
  'script',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listLanguagesQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  script: scriptSchema.optional(),
  isoCode: isoCodeSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(LANGUAGE_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListLanguagesQuery = z.infer<typeof listLanguagesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createLanguageBodySchema = z.object({
  name: nameSchema,
  nativeName: nativeNameSchema.optional(),
  isoCode: isoCodeSchema.optional(),
  script: scriptSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateLanguageBody = z.infer<typeof createLanguageBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateLanguageBodySchema = z
  .object({
    name: nameSchema.optional(),
    nativeName: nativeNameSchema.optional(),
    isoCode: isoCodeSchema.optional(),
    script: scriptSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateLanguageBody = z.infer<typeof updateLanguageBodySchema>;
