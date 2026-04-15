// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/course-chapters (phase 09).
// Junction table: course_chapters (course_subject_id, chapter_id)
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ──────────────────────────────────────────────

export const COURSE_CHAPTER_SORT_COLUMNS = [
  'id',
  'display_order',
  'course_subject_id',
  'chapter_id',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listCourseChaptersQuerySchema = paginationSchema.extend({
  courseSubjectId: z.coerce.number().int().positive().optional(),
  chapterId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(COURSE_CHAPTER_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseChaptersQuery = z.infer<typeof listCourseChaptersQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createCourseChapterBodySchema = z.object({
  courseSubjectId: z.number().int().positive(),
  chapterId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).optional(),
  isFreeTrial: z.boolean().optional(),
  note: z.string().max(10_000).optional(),
  isActive: z.boolean().optional()
});
export type CreateCourseChapterBody = z.infer<typeof createCourseChapterBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateCourseChapterBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).optional(),
    isFreeTrial: z.boolean().optional(),
    note: z.string().max(10_000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseChapterBody = z.infer<typeof updateCourseChapterBodySchema>;
