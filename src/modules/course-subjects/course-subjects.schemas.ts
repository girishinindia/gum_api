// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/course-subjects (phase 09).
// Junction table: course_subjects (course_id, module_id, subject_id)
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ──────────────────────────────────────────────

export const COURSE_SUBJECT_SORT_COLUMNS = [
  'id',
  'display_order',
  'course_id',
  'module_id',
  'subject_id',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listCourseSubjectsQuerySchema = paginationSchema.extend({
  courseId: z.coerce.number().int().positive().optional(),
  moduleId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(COURSE_SUBJECT_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseSubjectsQuery = z.infer<typeof listCourseSubjectsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createCourseSubjectBodySchema = z.object({
  courseId: z.number().int().positive(),
  moduleId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).optional(),
  note: z.string().max(10_000).optional(),
  isActive: z.boolean().optional()
});
export type CreateCourseSubjectBody = z.infer<typeof createCourseSubjectBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateCourseSubjectBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).optional(),
    note: z.string().max(10_000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseSubjectBody = z.infer<typeof updateCourseSubjectBodySchema>;
