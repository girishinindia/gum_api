// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/course-module-topics (phase 09).
// Dual-mode junction: linked (topic_id) OR custom (custom_title).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ──────────────────────────────────────────────

export const CMT_SORT_COLUMNS = [
  'id',
  'display_order',
  'course_module_id',
  'custom_title',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────
// NOTE: This get function uses 1-based p_page_index / p_page_size
// (not limit/offset), so the service layer passes them directly.

export const listCourseModuleTopicsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  courseModuleId: z.coerce.number().int().positive().optional(),
  topicId: z.coerce.number().int().positive().optional(),
  hasTopic: queryBooleanSchema.optional(),
  isPreview: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(CMT_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseModuleTopicsQuery = z.infer<typeof listCourseModuleTopicsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createCourseModuleTopicBodySchema = z.object({
  courseModuleId: z.number().int().positive(),
  topicId: z.number().int().positive().optional(),
  displayOrder: z.number().int().min(0).optional(),
  customTitle: z.string().max(500).optional(),
  customDescription: z.string().max(10_000).optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  isPreview: z.boolean().optional(),
  note: z.string().max(10_000).optional(),
  isActive: z.boolean().optional()
});
export type CreateCourseModuleTopicBody = z.infer<typeof createCourseModuleTopicBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateCourseModuleTopicBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).optional(),
    customTitle: z.string().max(500).optional(),
    customDescription: z.string().max(10_000).optional(),
    estimatedMinutes: z.number().int().min(0).optional(),
    isPreview: z.boolean().optional(),
    note: z.string().max(10_000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseModuleTopicBody = z.infer<typeof updateCourseModuleTopicBodySchema>;
