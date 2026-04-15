// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/sub-topics router (phase 08).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Column constraints from phase-08 sub_topics table:
// slug ≤ 100 chars, difficulty_level enum, estimated_minutes INT
// name ≤ 255 chars in translations (CITEXT)
// short_intro, long_intro ≤ 5000 chars
// page_url unique string (NEW to sub_topics)
// icon, image, video are image/video URLs

const topicIdSchema = z.number().int().positive('topic_id must be positive');

const slugSchema = z
  .string()
  .trim()
  .min(1, 'slug is too short')
  .max(100, 'slug is too long')
  .optional();

const displayOrderSchema = z
  .number()
  .int()
  .min(-32768)
  .max(32767)
  .optional();

const difficultyLevelSchema = z
  .enum(['beginner', 'intermediate', 'advanced', 'expert'])
  .optional();

const estimatedMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(2147483647)
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
  .max(5000, 'shortIntro is too long')
  .optional();

const longIntroSchema = z
  .string()
  .trim()
  .max(5000, 'longIntro is too long')
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

const videoSchema = z
  .string()
  .trim()
  .max(2000, 'video is too long')
  .optional();

const tagsSchema = z.unknown().optional(); // JSONB

const pageUrlSchema = z
  .string()
  .trim()
  .max(2000, 'pageUrl is too long')
  .optional();

const authorSchema = z
  .string()
  .trim()
  .max(255, 'author is too long')
  .optional();

const metaTitleSchema = z
  .string()
  .trim()
  .max(255, 'metaTitle is too long')
  .optional();

const metaDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'metaDescription is too long')
  .optional();

const metaKeywordsSchema = z
  .string()
  .trim()
  .max(500, 'metaKeywords is too long')
  .optional();

const canonicalUrlSchema = z
  .string()
  .trim()
  .max(2000, 'canonicalUrl is too long')
  .optional();

const ogSiteNameSchema = z
  .string()
  .trim()
  .max(500, 'ogSiteName is too long')
  .optional();

const ogTitleSchema = z
  .string()
  .trim()
  .max(255, 'ogTitle is too long')
  .optional();

const ogDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'ogDescription is too long')
  .optional();

const ogTypeSchema = z
  .string()
  .trim()
  .max(100, 'ogType is too long')
  .optional();

const ogImageSchema = z
  .string()
  .trim()
  .max(2000, 'ogImage is too long')
  .optional();

const ogUrlSchema = z
  .string()
  .trim()
  .max(2000, 'ogUrl is too long')
  .optional();

const twitterSiteSchema = z
  .string()
  .trim()
  .max(255, 'twitterSite is too long')
  .optional();

const twitterTitleSchema = z
  .string()
  .trim()
  .max(255, 'twitterTitle is too long')
  .optional();

const twitterDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'twitterDescription is too long')
  .optional();

const twitterImageSchema = z
  .string()
  .trim()
  .max(2000, 'twitterImage is too long')
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
  .max(500, 'focusKeyword is too long')
  .optional();

const structuredDataSchema = z.unknown().optional(); // JSONB

// ─── Sort allowlist ──────────────────────────────────────────────

export const SUB_TOPIC_SORT_COLUMNS = [
  'id',
  'slug',
  'display_order',
  'difficulty_level',
  'estimated_minutes',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const SUB_TOPIC_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'sub_topic_id',
  'created_at'
] as const;

// ─── List sub-topics query ──────────────────────────────────────

export const listSubTopicsQuerySchema = paginationSchema.extend({
  topicId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SUB_TOPIC_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSubTopicsQuery = z.infer<typeof listSubTopicsQuerySchema>;

// ─── Create sub-topic body ──────────────────────────────────────

export const createSubTopicBodySchema = z.object({
  topicId: topicIdSchema,
  slug: slugSchema,
  displayOrder: displayOrderSchema,
  difficultyLevel: difficultyLevelSchema,
  estimatedMinutes: estimatedMinutesSchema,
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
      video: videoSchema,
      tags: tagsSchema,
      pageUrl: pageUrlSchema,
      author: authorSchema,
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
      structuredData: structuredDataSchema
    })
    .optional()
});
export type CreateSubTopicBody = z.infer<typeof createSubTopicBodySchema>;

// ─── Update sub-topic body ──────────────────────────────────────

export const updateSubTopicBodySchema = z.object({
  topicId: topicIdSchema.optional(),
  slug: slugSchema,
  displayOrder: displayOrderSchema,
  difficultyLevel: difficultyLevelSchema,
  estimatedMinutes: estimatedMinutesSchema,
  note: noteSchema,
  isActive: isActiveSchema
});
export type UpdateSubTopicBody = z.infer<typeof updateSubTopicBodySchema>;

// ─── List sub-topic translations query ──────────────────────────

export const listSubTopicTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  // Query param arrives as a string — coerce so `?languageId=1` works.
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SUB_TOPIC_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSubTopicTranslationsQuery = z.infer<typeof listSubTopicTranslationsQuerySchema>;

// ─── Create sub-topic translation body ──────────────────────────

export const createSubTopicTranslationBodySchema = z.object({
  languageId: languageIdSchema,
  name: translationNameSchema,
  shortIntro: shortIntroSchema,
  longIntro: longIntroSchema,
  icon: iconSchema,
  image: imageSchema,
  video: videoSchema,
  tags: tagsSchema,
  pageUrl: pageUrlSchema,
  author: authorSchema,
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
  structuredData: structuredDataSchema
});
export type CreateSubTopicTranslationBody = z.infer<typeof createSubTopicTranslationBodySchema>;

// ─── Update sub-topic translation body ──────────────────────────

export const updateSubTopicTranslationBodySchema = z
  .object({
    name: translationNameSchema.optional(),
    shortIntro: shortIntroSchema,
    longIntro: longIntroSchema,
    icon: iconSchema,
    image: imageSchema,
    video: videoSchema,
    tags: tagsSchema,
    pageUrl: pageUrlSchema,
    author: authorSchema,
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
    isActive: isActiveSchema
  });
// NOTE: No "at-least-one-field" refine — PATCH .../translations/:tid accepts
// multipart/form-data with optional image slots (icon, image, ogImage,
// twitterImage). Route handler enforces `hasTextChange || hasFile`.
export type UpdateSubTopicTranslationBody = z.infer<typeof updateSubTopicTranslationBodySchema>;
