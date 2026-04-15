// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/course-sub-categories router (phase 09).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ──────────────────────────────────────────────

export const COURSE_SUB_CATEGORY_SORT_COLUMNS = [
  'id',
  'display_order',
  'is_primary',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listCourseSubCategoriesQuerySchema = paginationSchema.extend({
  courseId: z.coerce.number().int().positive().optional(),
  subCategoryId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  isPrimary: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(COURSE_SUB_CATEGORY_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseSubCategoriesQuery = z.infer<typeof listCourseSubCategoriesQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createCourseSubCategoryBodySchema = z.object({
  courseId: z.number().int().positive(),
  subCategoryId: z.number().int().positive(),
  isPrimary: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});
export type CreateCourseSubCategoryBody = z.infer<typeof createCourseSubCategoryBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateCourseSubCategoryBodySchema = z
  .object({
    isPrimary: z.boolean().optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseSubCategoryBody = z.infer<typeof updateCourseSubCategoryBodySchema>;
