// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/assessment-solutions (phase 11).
// Assessment solutions + nested translations sub-resource.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const solutionTypeSchema = z.enum([
  'coding_file',
  'github_link',
  'pdf',
  'image',
  'video',
  'other'
]);

const titleSchema = z
  .string()
  .trim()
  .min(1, 'title is too short')
  .max(500, 'title is too long');

// ─── Sort allowlist ──────────────────────────────────────────────

export const SOLUTION_SORT_COLUMNS = [
  'display_order',
  'solution_type',
  'file_name',
  'file_size_bytes',
  'video_duration_seconds',
  'created_at',
  'updated_at',
  'title'
] as const;

export const SOLUTION_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List assessment solutions query ────────────────────────────

export const listAssessmentSolutionsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  solutionType: solutionTypeSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SOLUTION_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListAssessmentSolutionsQuery = z.infer<typeof listAssessmentSolutionsQuerySchema>;

// ─── Create assessment solution body ────────────────────────────

export const createAssessmentSolutionBodySchema = z.object({
  solutionType: solutionTypeSchema,
  fileUrl: z.string().trim().max(2000).optional(),
  githubUrl: z.string().trim().max(2000).optional(),
  videoUrl: z.string().trim().max(2000).optional(),
  fileName: z.string().trim().max(500).optional(),
  fileSizeBytes: z.number().int().min(0).optional(),
  mimeType: z.string().trim().max(255).optional(),
  videoDurationSeconds: z.number().int().min(0).optional(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateAssessmentSolutionBody = z.infer<typeof createAssessmentSolutionBodySchema>;

// ─── Update assessment solution body ────────────────────────────

export const updateAssessmentSolutionBodySchema = z
  .object({
    solutionType: solutionTypeSchema.optional(),
    fileUrl: z.string().trim().max(2000).optional(),
    githubUrl: z.string().trim().max(2000).optional(),
    videoUrl: z.string().trim().max(2000).optional(),
    fileName: z.string().trim().max(500).optional(),
    fileSizeBytes: z.number().int().min(0).optional(),
    mimeType: z.string().trim().max(255).optional(),
    videoDurationSeconds: z.number().int().min(0).optional(),
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateAssessmentSolutionBody = z.infer<typeof updateAssessmentSolutionBodySchema>;

// ─── List solution translations query ───────────────────────────

export const listSolutionTranslationsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SOLUTION_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSolutionTranslationsQuery = z.infer<typeof listSolutionTranslationsQuerySchema>;

// ─── Create solution translation body ───────────────────────────

export const createSolutionTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: z.string().trim().max(10000).optional(),
  videoTitle: z.string().trim().max(500).optional(),
  videoDescription: z.string().trim().max(10000).optional(),
  videoThumbnail: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional()
});
export type CreateSolutionTranslationBody = z.infer<typeof createSolutionTranslationBodySchema>;

// ─── Update solution translation body ───────────────────────────

export const updateSolutionTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(10000).optional(),
    videoTitle: z.string().trim().max(500).optional(),
    videoDescription: z.string().trim().max(10000).optional(),
    videoThumbnail: z.string().trim().max(2000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateSolutionTranslationBody = z.infer<typeof updateSolutionTranslationBodySchema>;
