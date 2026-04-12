// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/subjects router (phase 08).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Column length constraints from phase-08/subjects tables.
// CITEXT code, slug ≤ 100 chars enforced by constraint
// CITEXT name ≤ 255 chars in translations
// short_intro, long_intro ≤ 5000 chars in translations
// video_title, video_description ≤ 500 chars in translations

const codeSchema = z
  .string()
  .trim()
  .min(1, 'code is too short')
  .max(100, 'code is too long');

const slugSchema = z
  .string()
  .trim()
  .min(1, 'slug is too short')
  .max(100, 'slug is too long');

const difficultyLevelSchema = z
  .enum(['beginner', 'intermediate', 'advanced', 'expert', 'all_levels'])
  .optional();

const estimatedHoursSchema = z
  .number()
  .positive()
  .max(999999.9)
  .optional();

const displayOrderSchema = z
  .number()
  .int()
  .min(-32768)
  .max(32767)
  .optional();

const noteSchema = z
  .string()
  .trim()
  .max(5000, 'note is too long')
  .optional();

const isActiveSchema = z.boolean().optional();

// Translation fields - all optional except name and languageId
const languageIdSchema = z.number().int().positive();

const translationNameSchema = z
  .string()
  .trim()
  .min(1, 'translation name is too short')
  .max(255, 'translation name is too long');

const shortIntroSchema = z
  .string()
  .trim()
  .max(5000, 'short intro is too long')
  .optional();

const longIntroSchema = z
  .string()
  .trim()
  .max(5000, 'long intro is too long')
  .optional();

const iconSchema = z
  .string()
  .trim()
  .max(2000, 'icon is too long')
  .optional();

const imageSchema = z
  .string()
  .trim()
  .max(2000, 'image is too long')
  .optional();

const videoTitleSchema = z
  .string()
  .trim()
  .max(500, 'video title is too long')
  .optional();

const videoDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'video description is too long')
  .optional();

const videoThumbnailSchema = z
  .string()
  .trim()
  .max(2000, 'video thumbnail is too long')
  .optional();

const videoDurationMinutesSchema = z
  .number()
  .positive()
  .optional();

const tagsSchema = z.unknown().optional(); // JSONB, accepts array or object

const metaTitleSchema = z
  .string()
  .trim()
  .max(255, 'meta title is too long')
  .optional();

const metaDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'meta description is too long')
  .optional();

const metaKeywordsSchema = z
  .string()
  .trim()
  .max(500, 'meta keywords is too long')
  .optional();

const canonicalUrlSchema = z
  .string()
  .trim()
  .max(2000, 'canonical URL is too long')
  .optional();

const ogSiteNameSchema = z
  .string()
  .trim()
  .max(500, 'og site name is too long')
  .optional();

const ogTitleSchema = z
  .string()
  .trim()
  .max(255, 'og title is too long')
  .optional();

const ogDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'og description is too long')
  .optional();

const ogTypeSchema = z
  .string()
  .trim()
  .max(100, 'og type is too long')
  .optional();

const ogImageSchema = z
  .string()
  .trim()
  .max(2000, 'og image is too long')
  .optional();

const ogUrlSchema = z
  .string()
  .trim()
  .max(2000, 'og URL is too long')
  .optional();

const twitterSiteSchema = z
  .string()
  .trim()
  .max(255, 'twitter site is too long')
  .optional();

const twitterTitleSchema = z
  .string()
  .trim()
  .max(255, 'twitter title is too long')
  .optional();

const twitterDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'twitter description is too long')
  .optional();

const twitterImageSchema = z
  .string()
  .trim()
  .max(2000, 'twitter image is too long')
  .optional();

const twitterCardSchema = z
  .string()
  .trim()
  .default('summary_large_image')
  .optional();

const robotsDirectiveSchema = z
  .string()
  .trim()
  .default('index,follow')
  .optional();

const focusKeywordSchema = z
  .string()
  .trim()
  .max(500, 'focus keyword is too long')
  .optional();

const authorNameSchema = z
  .string()
  .trim()
  .max(255, 'author name is too long')
  .optional();

const authorBioSchema = z
  .string()
  .trim()
  .max(1000, 'author bio is too long')
  .optional();

const structuredDataSchema = z.unknown().optional(); // JSONB

// ─── Sort allowlist ──────────────────────────────────────────────

export const SUBJECT_SORT_COLUMNS = [
  'id',
  'code',
  'slug',
  'difficulty_level',
  'estimated_hours',
  'display_order',
  'view_count',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const SUBJECT_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'subject_id',
  'created_at'
] as const;

// ─── List subject query ──────────────────────────────────────────

export const listSubjectsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'all_levels']).optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SUBJECT_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;

// ─── Create subject body ─────────────────────────────────────────

export const createSubjectBodySchema = z.object({
  code: codeSchema,
  difficultyLevel: difficultyLevelSchema,
  estimatedHours: estimatedHoursSchema,
  displayOrder: displayOrderSchema,
  note: noteSchema,
  isActive: isActiveSchema,
  // Optional embedded translation
  translation: z
    .object({
      languageId: languageIdSchema,
      name: translationNameSchema,
      shortIntro: shortIntroSchema,
      longIntro: longIntroSchema,
      icon: iconSchema,
      image: imageSchema,
      videoTitle: videoTitleSchema,
      videoDescription: videoDescriptionSchema,
      videoThumbnail: videoThumbnailSchema,
      videoDurationMinutes: videoDurationMinutesSchema,
      tags: tagsSchema,
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
      authorName: authorNameSchema,
      authorBio: authorBioSchema,
      structuredData: structuredDataSchema
    })
    .optional()
});
export type CreateSubjectBody = z.infer<typeof createSubjectBodySchema>;

// ─── Update subject body ─────────────────────────────────────────

export const updateSubjectBodySchema = z.object({
  code: codeSchema.optional(),
  difficultyLevel: difficultyLevelSchema,
  estimatedHours: estimatedHoursSchema,
  displayOrder: displayOrderSchema,
  note: noteSchema,
  isActive: isActiveSchema
});
export type UpdateSubjectBody = z.infer<typeof updateSubjectBodySchema>;

// ─── List subject translations query ─────────────────────────────

export const listSubjectTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  // Query param arrives as a string — coerce so `?languageId=1` works.
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SUBJECT_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSubjectTranslationsQuery = z.infer<typeof listSubjectTranslationsQuerySchema>;

// ─── Create subject translation body ─────────────────────────────

export const createSubjectTranslationBodySchema = z.object({
  languageId: languageIdSchema,
  name: translationNameSchema,
  shortIntro: shortIntroSchema,
  longIntro: longIntroSchema,
  icon: iconSchema,
  image: imageSchema,
  videoTitle: videoTitleSchema,
  videoDescription: videoDescriptionSchema,
  videoThumbnail: videoThumbnailSchema,
  videoDurationMinutes: videoDurationMinutesSchema,
  tags: tagsSchema,
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
  authorName: authorNameSchema,
  authorBio: authorBioSchema,
  structuredData: structuredDataSchema
});
export type CreateSubjectTranslationBody = z.infer<typeof createSubjectTranslationBodySchema>;

// ─── Update subject translation body ─────────────────────────────

export const updateSubjectTranslationBodySchema = z
  .object({
    name: translationNameSchema.optional(),
    shortIntro: shortIntroSchema,
    longIntro: longIntroSchema,
    icon: iconSchema,
    image: imageSchema,
    videoTitle: videoTitleSchema,
    videoDescription: videoDescriptionSchema,
    videoThumbnail: videoThumbnailSchema,
    videoDurationMinutes: videoDurationMinutesSchema,
    tags: tagsSchema,
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
    authorName: authorNameSchema,
    authorBio: authorBioSchema,
    structuredData: structuredDataSchema,
    isActive: isActiveSchema
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateSubjectTranslationBody = z.infer<typeof updateSubjectTranslationBodySchema>;
