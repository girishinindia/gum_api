// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/course-instructors (phase 09).
// Junction table: course_instructors (course_id, instructor_id)
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enum ────────────────────────────────────────────────────────

export const INSTRUCTOR_ROLES = [
  'primary',
  'co_instructor',
  'guest',
  'teaching_assistant',
  'mentor',
  'reviewer',
  'other'
] as const;

// ─── Sort allowlist ──────────────────────────────────────────────

export const COURSE_INSTRUCTOR_SORT_COLUMNS = [
  'id',
  'display_order',
  'course_id',
  'instructor_id',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listCourseInstructorsQuerySchema = paginationSchema.extend({
  courseId: z.coerce.number().int().positive().optional(),
  instructorId: z.coerce.number().int().positive().optional(),
  instructorRole: z.enum(INSTRUCTOR_ROLES).optional(),
  isVisible: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(COURSE_INSTRUCTOR_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseInstructorsQuery = z.infer<typeof listCourseInstructorsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createCourseInstructorBodySchema = z.object({
  courseId: z.number().int().positive(),
  instructorId: z.number().int().positive(),
  instructorRole: z.enum(INSTRUCTOR_ROLES).optional(),
  contribution: z.string().max(10_000).optional(),
  revenueSharePct: z.number().min(0).max(100).optional(),
  joinDate: z.string().date().optional(),
  leaveDate: z.string().date().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateCourseInstructorBody = z.infer<typeof createCourseInstructorBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateCourseInstructorBodySchema = z
  .object({
    instructorRole: z.enum(INSTRUCTOR_ROLES).optional(),
    contribution: z.string().max(10_000).optional(),
    revenueSharePct: z.number().min(0).max(100).optional(),
    joinDate: z.string().date().optional(),
    leaveDate: z.string().date().optional(),
    displayOrder: z.number().int().min(0).optional(),
    isVisible: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseInstructorBody = z.infer<typeof updateCourseInstructorBodySchema>;
