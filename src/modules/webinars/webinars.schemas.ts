// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/webinars (phase 12).
// Webinars + nested translations sub-resource.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const webinarOwnerSchema = z.enum(['system', 'instructor']);

const webinarStatusSchema = z.enum([
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

export const WEBINAR_SORT_COLUMNS = [
  'webinar_scheduled_at',
  'webinar_trans_title',
  'webinar_trans_created_at',
  'webinar_trans_updated_at',
  'webinar_created_at',
  'webinar_updated_at',
  'webinar_price',
  'webinar_display_order',
  'webinar_registered_count',
  'webinar_duration_minutes',
  'webinar_code',
  'webinar_slug',
  'webinar_owner',
  'webinar_webinar_status',
  'webinar_meeting_platform'
] as const;

export const WEBINAR_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List webinars query ─────────────────────────────────────────

export const listWebinarsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  webinarOwner: webinarOwnerSchema.optional(),
  webinarStatus: webinarStatusSchema.optional(),
  meetingPlatform: meetingPlatformSchema.optional(),
  isFree: queryBooleanSchema.optional(),
  courseId: z.coerce.number().int().positive().optional(),
  chapterId: z.coerce.number().int().positive().optional(),
  instructorId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(WEBINAR_SORT_COLUMNS).default('webinar_scheduled_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListWebinarsQuery = z.infer<typeof listWebinarsQuerySchema>;

// ─── Create webinar body ─────────────────────────────────────────

export const createWebinarBodySchema = z.object({
  webinarOwner: webinarOwnerSchema.default('system'),
  instructorId: z.number().int().positive().optional(),
  courseId: z.number().int().positive().optional(),
  chapterId: z.number().int().positive().optional(),
  code: codeSchema.optional(),
  isFree: z.boolean().optional(),
  price: z.number().min(0).max(99999999.99).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(0).max(32767).optional(),
  maxAttendees: z.number().int().min(0).optional(),
  meetingPlatform: meetingPlatformSchema.optional(),
  meetingUrl: z.string().trim().max(2000).optional(),
  meetingId: z.string().trim().max(500).optional(),
  meetingPassword: z.string().trim().max(500).optional(),
  recordingUrl: z.string().trim().max(2000).optional(),
  webinarStatus: webinarStatusSchema.optional(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateWebinarBody = z.infer<typeof createWebinarBodySchema>;

// ─── Update webinar body ─────────────────────────────────────────

export const updateWebinarBodySchema = z
  .object({
    instructorId: z.number().int().positive().optional(),
    courseId: z.number().int().positive().optional(),
    chapterId: z.number().int().positive().optional(),
    code: z.string().trim().max(100).optional(),
    isFree: z.boolean().optional(),
    price: z.number().min(0).max(99999999.99).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(0).max(32767).optional(),
    maxAttendees: z.number().int().min(0).optional(),
    meetingPlatform: meetingPlatformSchema.optional(),
    meetingUrl: z.string().trim().max(2000).optional(),
    meetingId: z.string().trim().max(500).optional(),
    meetingPassword: z.string().trim().max(500).optional(),
    recordingUrl: z.string().trim().max(2000).optional(),
    webinarStatus: webinarStatusSchema.optional(),
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateWebinarBody = z.infer<typeof updateWebinarBodySchema>;

// ─── List translations query ─────────────────────────────────────

export const listWebinarTranslationsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(WEBINAR_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListWebinarTranslationsQuery = z.infer<typeof listWebinarTranslationsQuerySchema>;

// ─── Create translation body ─────────────────────────────────────

export const createWebinarTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: z.string().trim().max(10000).optional(),
  shortDescription: z.string().trim().max(2000).optional(),
  thumbnailUrl: urlSchema,
  bannerUrl: urlSchema,
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
export type CreateWebinarTranslationBody = z.infer<typeof createWebinarTranslationBodySchema>;

// ─── Update translation body ─────────────────────────────────────

export const updateWebinarTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(10000).optional(),
    shortDescription: z.string().trim().max(2000).optional(),
    thumbnailUrl: urlSchema,
    bannerUrl: urlSchema,
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
export type UpdateWebinarTranslationBody = z.infer<typeof updateWebinarTranslationBodySchema>;
