// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/topics router (phase 08).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Column length constraints from phase-08/03-topics/01_table.sql
// and topic_translations table

const slugSchema = z
  .string()
  .trim()
  .min(1, 'slug is too short')
  .max(100, 'slug is too long');

const difficultyLevelSchema = z
  .enum(['beginner', 'intermediate', 'advanced', 'expert'])
  .optional();

const estimatedMinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(2147483647) // INT max
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

// Translation fields
const languageIdSchema = z.number().int().positive();

const translationNameSchema = z
  .string()
  .trim()
  .min(1, 'translation name is too short')
  .max(255, 'translation name is too long');

const shortIntroSchema = z
  .string()
  .trim()
  .max(500, 'short intro is too long')
  .optional();

const longIntroSchema = z
  .string()
  .trim()
  .max(5000, 'long intro is too long')
  .optional();

const prerequisitesSchema = z.unknown().optional(); // JSONB

const learningObjectivesSchema = z.unknown().optional(); // JSONB

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

const authorSchema = z
  .string()
  .trim()
  .max(255, 'author is too long')
  .optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const TOPIC_SORT_COLUMNS = [
  'id',
  'slug',
  'display_order',
  'difficulty_level',
  'estimated_minutes',
  'view_count',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const TOPIC_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'topic_id',
  'created_at'
] as const;

// ─── List topics query ───────────────────────────────────────────

export const listTopicsQuerySchema = paginationSchema.extend({
  chapterId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(TOPIC_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListTopicsQuery = z.infer<typeof listTopicsQuerySchema>;

// ─── Create topic body ───────────────────────────────────────────

export const createTopicBodySchema = z.object({
  chapterId: z.coerce.number().int().positive().optional().nullable(),
  slug: slugSchema.optional(),
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
      prerequisites: prerequisitesSchema,
      learningObjectives: learningObjectivesSchema,
      icon: iconSchema,
      image: imageSchema,
      video: videoSchema,
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
      author: authorSchema,
      structuredData: structuredDataSchema
    })
    .optional()
});
export type CreateTopicBody = z.infer<typeof createTopicBodySchema>;

// ─── Update topic body ───────────────────────────────────────────

export const updateTopicBodySchema = z.object({
  slug: slugSchema.optional(),
  displayOrder: displayOrderSchema,
  difficultyLevel: difficultyLevelSchema,
  estimatedMinutes: estimatedMinutesSchema,
  note: noteSchema,
  isActive: isActiveSchema
});
export type UpdateTopicBody = z.infer<typeof updateTopicBodySchema>;

// ─── List topic translations query ───────────────────────────────

export const listTopicTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  // Query param arrives as a string — coerce so `?languageId=1` works.
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(TOPIC_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListTopicTranslationsQuery = z.infer<typeof listTopicTranslationsQuerySchema>;

// ─── Create topic translation body ───────────────────────────────

export const createTopicTranslationBodySchema = z.object({
  languageId: languageIdSchema,
  name: translationNameSchema,
  shortIntro: shortIntroSchema,
  longIntro: longIntroSchema,
  prerequisites: prerequisitesSchema,
  learningObjectives: learningObjectivesSchema,
  icon: iconSchema,
  image: imageSchema,
  video: videoSchema,
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
  author: authorSchema,
  structuredData: structuredDataSchema
});
export type CreateTopicTranslationBody = z.infer<typeof createTopicTranslationBodySchema>;

// ─── Update topic translation body ───────────────────────────────

export const updateTopicTranslationBodySchema = z
  .object({
    name: translationNameSchema.optional(),
    shortIntro: shortIntroSchema,
    longIntro: longIntroSchema,
    prerequisites: prerequisitesSchema,
    learningObjectives: learningObjectivesSchema,
    icon: iconSchema,
    image: imageSchema,
    video: videoSchema,
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
    author: authorSchema,
    structuredData: structuredDataSchema,
    isActive: isActiveSchema
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateTopicTranslationBody = z.infer<typeof updateTopicTranslationBodySchema>;
