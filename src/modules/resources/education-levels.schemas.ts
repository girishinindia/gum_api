// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/education-levels router (phase 02).
//
// Resource/permission code is `education_level` (snake_case, matches
// the DB table), but the URL is kebab-case `/education-levels`.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Matches CHECK constraint `chk_education_levels_category` in
// phase-02/05_education-levels/01_table.sql verbatim.

export const EDUCATION_LEVEL_CATEGORIES = [
  'pre_school',
  'school',
  'diploma',
  'undergraduate',
  'postgraduate',
  'doctoral',
  'professional',
  'informal',
  'other'
] as const;

const categorySchema = z.enum(EDUCATION_LEVEL_CATEGORIES);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');

const abbreviationSchema = z.string().trim().min(1).max(32);
const descriptionSchema = z.string().trim().max(2000);
const typicalDurationSchema = z.string().trim().min(1).max(64);
const typicalAgeRangeSchema = z.string().trim().min(1).max(32);

const levelOrderSchema = z
  .number({ invalid_type_error: 'levelOrder must be a number' })
  .int('levelOrder must be an integer')
  .min(0, 'levelOrder must be ≥ 0')
  .max(10000, 'levelOrder is out of range');

// ─── Sort allowlist ──────────────────────────────────────────────

export const EDUCATION_LEVEL_SORT_COLUMNS = [
  'id',
  'name',
  'level_order',
  'level_category',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listEducationLevelsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  category: categorySchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(EDUCATION_LEVEL_SORT_COLUMNS).default('level_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListEducationLevelsQuery = z.infer<typeof listEducationLevelsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────
//
// `level_order` is NOT NULL on the DB side — we require it here too.

export const createEducationLevelBodySchema = z.object({
  name: nameSchema,
  levelOrder: levelOrderSchema,
  levelCategory: categorySchema.default('other'),
  abbreviation: abbreviationSchema.optional(),
  description: descriptionSchema.optional(),
  typicalDuration: typicalDurationSchema.optional(),
  typicalAgeRange: typicalAgeRangeSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateEducationLevelBody = z.infer<typeof createEducationLevelBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateEducationLevelBodySchema = z
  .object({
    name: nameSchema.optional(),
    levelOrder: levelOrderSchema.optional(),
    levelCategory: categorySchema.optional(),
    abbreviation: abbreviationSchema.optional(),
    description: descriptionSchema.optional(),
    typicalDuration: typicalDurationSchema.optional(),
    typicalAgeRange: typicalAgeRangeSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateEducationLevelBody = z.infer<typeof updateEducationLevelBodySchema>;
