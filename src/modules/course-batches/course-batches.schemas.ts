// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/course-batches (phase 13).
// Course Batches + Batch Translations + Batch Sessions + Batch Session Translations.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const batchOwnerSchema = z.enum(['system', 'instructor']);

const batchStatusSchema = z.enum([
  'upcoming',
  'in_progress',
  'completed',
  'cancelled'
]);

const sessionStatusSchema = z.enum([
  'scheduled',
  'live',
  'completed',
  'cancelled'
]);

const meetingPlatformSchema = z.enum([
  'zoom',
  'google_meet',
  'teams',
  'custom'
]);

const titleSchema = z
  .string()
  .trim()
  .min(1, 'title is too short')
  .max(500, 'title is too long');

const codeSchema = z
  .string()
  .trim()
  .min(1, 'code is too short')
  .max(100, 'code is too long');

const urlSchema = z
  .string()
  .trim()
  .max(2000, 'URL is too long')
  .optional();

const jsonbArraySchema = z.unknown().optional();

// SEO fields
const metaTitleSchema = z.string().trim().max(255).optional();
const metaDescriptionSchema = z.string().trim().max(500).optional();
const metaKeywordsSchema = z.string().trim().max(500).optional();
const canonicalUrlSchema = z.string().trim().max(2000).optional();
const ogSiteNameSchema = z.string().trim().max(500).optional();
const ogTitleSchema = z.string().trim().max(255).optional();
const ogDescriptionSchema = z.string().trim().max(500).optional();
const ogTypeSchema = z.string().trim().max(100).optional();
const ogImageSchema = z.string().trim().max(2000).optional();
const ogUrlSchema = z.string().trim().max(2000).optional();
const twitterSiteSchema = z.string().trim().max(255).optional();
const twitterTitleSchema = z.string().trim().max(255).optional();
const twitterDescriptionSchema = z.string().trim().max(500).optional();
const twitterImageSchema = z.string().trim().max(2000).optional();
const twitterCardSchema = z.string().trim().max(100).optional();
const robotsDirectiveSchema = z.string().trim().max(100).optional();
const focusKeywordSchema = z.string().trim().max(500).optional();
const structuredDataSchema = z.unknown().optional();

// ─── Sort allowlists ─────────────────────────────────────────────

export const COURSE_BATCH_SORT_COLUMNS = [
  'id',
  'course_id',
  'is_free',
  'price',
  'batch_status',
  'starts_at',
  'created_at',
  'updated_at'
] as const;

export const BATCH_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

export const BATCH_SESSION_SORT_COLUMNS = [
  'id',
  'batch_id',
  'session_number',
  'session_date',
  'scheduled_at',
  'session_status',
  'display_order',
  'created_at',
  'updated_at'
] as const;

export const BATCH_SESSION_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List course batches query ────────────────────────────────────

export const listCourseBatchesQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COURSE_BATCH_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  searchTerm: searchTermSchema,
  courseId: z.coerce.number().int().positive().optional(),
  batchOwner: batchOwnerSchema.optional(),
  batchStatus: batchStatusSchema.optional(),
  isFree: queryBooleanSchema.optional(),
  meetingPlatform: meetingPlatformSchema.optional(),
  instructorId: z.coerce.number().int().positive().optional(),
  isDeleted: queryBooleanSchema.optional()
});
export type ListCourseBatchesQuery = z.infer<typeof listCourseBatchesQuerySchema>;

// ─── Create course batch body ─────────────────────────────────────

export const createCourseBatchBodySchema = z.object({
  courseId: z.number().int().positive(),
  batchOwner: batchOwnerSchema.optional(),
  instructorId: z.number().int().positive().optional(),
  code: codeSchema.optional(),
  isFree: z.boolean().optional(),
  price: z.number().min(0).max(99999999.99).optional(),
  includesCourseAccess: z.boolean().optional(),
  maxStudents: z.number().int().min(0).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  schedule: jsonbArraySchema,
  meetingPlatform: meetingPlatformSchema.optional(),
  batchStatus: batchStatusSchema.optional(),
  displayOrder: z.number().int().min(0).max(32767).optional()
});
export type CreateCourseBatchBody = z.infer<typeof createCourseBatchBodySchema>;

// ─── Update course batch body ─────────────────────────────────────

export const updateCourseBatchBodySchema = z
  .object({
    instructorId: z.number().int().positive().optional(),
    code: z.string().trim().max(100).optional(),
    isFree: z.boolean().optional(),
    price: z.number().min(0).max(99999999.99).optional(),
    includesCourseAccess: z.boolean().optional(),
    maxStudents: z.number().int().min(0).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    schedule: jsonbArraySchema,
    meetingPlatform: meetingPlatformSchema.optional(),
    batchStatus: batchStatusSchema.optional(),
    displayOrder: z.number().int().min(0).max(32767).optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseBatchBody = z.infer<typeof updateCourseBatchBodySchema>;

// ─── List batch translations query ────────────────────────────────

export const listBatchTranslationsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(BATCH_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListBatchTranslationsQuery = z.infer<typeof listBatchTranslationsQuerySchema>;

// ─── Create batch translation body ────────────────────────────────

export const createBatchTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: z.string().trim().max(10000).optional(),
  shortDescription: z.string().trim().max(2000).optional(),
  tags: jsonbArraySchema,
  metaTitle: metaTitleSchema,
  metaDescription: metaDescriptionSchema,
  metaKeywords: metaKeywordsSchema,
  canonicalUrl: canonicalUrlSchema,
  ogSiteName: ogSiteNameSchema,
  ogTitle: ogTitleSchema,
  ogDescription: ogDescriptionSchema,
  ogType: ogTypeSchema,
  ogImage: ogImageSchema,
  ogUrl: ogUrlSchema,
  twitterSite: twitterSiteSchema,
  twitterTitle: twitterTitleSchema,
  twitterDescription: twitterDescriptionSchema,
  twitterImage: twitterImageSchema,
  twitterCard: twitterCardSchema,
  robotsDirective: robotsDirectiveSchema,
  focusKeyword: focusKeywordSchema,
  structuredData: structuredDataSchema,
  isActive: z.boolean().optional()
});
export type CreateBatchTranslationBody = z.infer<typeof createBatchTranslationBodySchema>;

// ─── Update batch translation body ────────────────────────────────

export const updateBatchTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(10000).optional(),
    shortDescription: z.string().trim().max(2000).optional(),
    tags: jsonbArraySchema,
    metaTitle: metaTitleSchema,
    metaDescription: metaDescriptionSchema,
    metaKeywords: metaKeywordsSchema,
    canonicalUrl: canonicalUrlSchema,
    ogSiteName: ogSiteNameSchema,
    ogTitle: ogTitleSchema,
    ogDescription: ogDescriptionSchema,
    ogType: ogTypeSchema,
    ogImage: ogImageSchema,
    ogUrl: ogUrlSchema,
    twitterSite: twitterSiteSchema,
    twitterTitle: twitterTitleSchema,
    twitterDescription: twitterDescriptionSchema,
    twitterImage: twitterImageSchema,
    twitterCard: twitterCardSchema,
    robotsDirective: robotsDirectiveSchema,
    focusKeyword: focusKeywordSchema,
    structuredData: structuredDataSchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBatchTranslationBody = z.infer<typeof updateBatchTranslationBodySchema>;

// ─── List batch sessions query ────────────────────────────────────

export const listBatchSessionsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(BATCH_SESSION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  sessionStatus: sessionStatusSchema.optional(),
  isDeleted: queryBooleanSchema.optional()
});
export type ListBatchSessionsQuery = z.infer<typeof listBatchSessionsQuerySchema>;

// ─── Create batch session body ────────────────────────────────────

export const createBatchSessionBodySchema = z.object({
  sessionNumber: z.number().int().min(0).max(32767),
  sessionDate: z.string().date(),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(0).max(32767).optional(),
  meetingUrl: z.string().trim().max(2000).optional(),
  meetingId: z.string().trim().max(500).optional(),
  recordingUrl: z.string().trim().max(2000).optional(),
  sessionStatus: sessionStatusSchema.optional(),
  displayOrder: z.number().int().min(0).max(32767).optional()
});
export type CreateBatchSessionBody = z.infer<typeof createBatchSessionBodySchema>;

// ─── Update batch session body ────────────────────────────────────

export const updateBatchSessionBodySchema = z
  .object({
    sessionDate: z.string().date().optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(0).max(32767).optional(),
    meetingUrl: z.string().trim().max(2000).optional(),
    meetingId: z.string().trim().max(500).optional(),
    recordingUrl: z.string().trim().max(2000).optional(),
    sessionStatus: sessionStatusSchema.optional(),
    displayOrder: z.number().int().min(0).max(32767).optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBatchSessionBody = z.infer<typeof updateBatchSessionBodySchema>;

// ─── List batch session translations query ────────────────────────

export const listBatchSessionTranslationsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(BATCH_SESSION_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListBatchSessionTranslationsQuery = z.infer<typeof listBatchSessionTranslationsQuerySchema>;

// ─── Create batch session translation body ────────────────────────

export const createBatchSessionTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: z.string().trim().max(10000).optional(),
  isActive: z.boolean().optional()
});
export type CreateBatchSessionTranslationBody = z.infer<typeof createBatchSessionTranslationBodySchema>;

// ─── Update batch session translation body ────────────────────────

export const updateBatchSessionTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(10000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBatchSessionTranslationBody = z.infer<typeof updateBatchSessionTranslationBodySchema>;
