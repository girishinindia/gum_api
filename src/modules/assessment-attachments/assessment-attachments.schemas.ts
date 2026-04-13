// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/assessment-attachments (phase 11).
// Assessment attachments + nested translations sub-resource.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const attachmentTypeSchema = z.enum([
  'coding_file',
  'github_link',
  'pdf',
  'image',
  'other'
]);

const titleSchema = z
  .string()
  .trim()
  .min(1, 'title is too short')
  .max(500, 'title is too long');

const urlSchema = z
  .string()
  .trim()
  .max(2000, 'URL is too long')
  .optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const ATTACHMENT_SORT_COLUMNS = [
  'display_order',
  'attachment_type',
  'file_name',
  'file_size_bytes',
  'created_at',
  'updated_at',
  'title'
] as const;

export const ATTACHMENT_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List assessment attachments query ──────────────────────────

export const listAssessmentAttachmentsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  attachmentType: attachmentTypeSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(ATTACHMENT_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListAssessmentAttachmentsQuery = z.infer<typeof listAssessmentAttachmentsQuerySchema>;

// ─── Create assessment attachment body ──────────────────────────

export const createAssessmentAttachmentBodySchema = z.object({
  attachmentType: attachmentTypeSchema,
  fileUrl: z.string().trim().max(2000).optional(),
  githubUrl: z.string().trim().max(2000).optional(),
  fileName: z.string().trim().max(500).optional(),
  fileSizeBytes: z.number().int().min(0).optional(),
  mimeType: z.string().trim().max(255).optional(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateAssessmentAttachmentBody = z.infer<typeof createAssessmentAttachmentBodySchema>;

// ─── Update assessment attachment body ──────────────────────────

export const updateAssessmentAttachmentBodySchema = z
  .object({
    attachmentType: attachmentTypeSchema.optional(),
    fileUrl: z.string().trim().max(2000).optional(),
    githubUrl: z.string().trim().max(2000).optional(),
    fileName: z.string().trim().max(500).optional(),
    fileSizeBytes: z.number().int().min(0).optional(),
    mimeType: z.string().trim().max(255).optional(),
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateAssessmentAttachmentBody = z.infer<typeof updateAssessmentAttachmentBodySchema>;

// ─── List attachment translations query ─────────────────────────

export const listAttachmentTranslationsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(ATTACHMENT_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListAttachmentTranslationsQuery = z.infer<typeof listAttachmentTranslationsQuerySchema>;

// ─── Create attachment translation body ─────────────────────────

export const createAttachmentTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: z.string().trim().max(10000).optional(),
  isActive: z.boolean().optional()
});
export type CreateAttachmentTranslationBody = z.infer<typeof createAttachmentTranslationBodySchema>;

// ─── Update attachment translation body ─────────────────────────

export const updateAttachmentTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(10000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateAttachmentTranslationBody = z.infer<typeof updateAttachmentTranslationBodySchema>;
