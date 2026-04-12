// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/bundle-courses (phase 09).
// Junction table: bundle_courses (bundle_id, course_id)
// Only display_order and is_active are mutable after creation.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ──────────────────────────────────────────────

export const BUNDLE_COURSE_SORT_COLUMNS = [
  'id',
  'bundle_id',
  'course_id',
  'display_order',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listBundleCoursesQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  bundleId: z.coerce.number().int().positive().optional(),
  courseId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.string().default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListBundleCoursesQuery = z.infer<typeof listBundleCoursesQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createBundleCourseBodySchema = z.object({
  bundleId: z.number().int().positive(),
  courseId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});
export type CreateBundleCourseBody = z.infer<typeof createBundleCourseBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateBundleCourseBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBundleCourseBody = z.infer<typeof updateBundleCourseBodySchema>;
