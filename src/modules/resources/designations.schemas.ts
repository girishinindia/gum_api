// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/designations router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Matches CHECK constraint `chk_designations_band` in
// phase-02/09-designations/01_table.sql verbatim — keep them in sync.

export const DESIGNATION_LEVEL_BANDS = [
  'intern',
  'entry',
  'mid',
  'senior',
  'lead',
  'manager',
  'director',
  'executive'
] as const;

const levelBandSchema = z.enum(DESIGNATION_LEVEL_BANDS);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');

const codeSchema = z.string().trim().min(1).max(32);
const descriptionSchema = z.string().trim().max(2000).optional();
const levelSchema = z.coerce.number().int().min(0).max(10);

// ─── Sort allowlist ──────────────────────────────────────────────

export const DESIGNATION_SORT_COLUMNS = [
  'id',
  'name',
  'code',
  'level',
  'level_band',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listDesignationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  levelBand: levelBandSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(DESIGNATION_SORT_COLUMNS).default('level'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListDesignationsQuery = z.infer<typeof listDesignationsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createDesignationBodySchema = z.object({
  name: nameSchema,
  code: codeSchema.optional(),
  level: levelSchema.default(1),
  levelBand: levelBandSchema.default('entry'),
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreateDesignationBody = z.infer<typeof createDesignationBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateDesignationBodySchema = z
  .object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    level: levelSchema.optional(),
    levelBand: levelBandSchema.optional(),
    description: descriptionSchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateDesignationBody = z.infer<typeof updateDesignationBodySchema>;
