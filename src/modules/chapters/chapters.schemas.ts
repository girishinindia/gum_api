// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/chapters router (phase 08).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Column length constraints from phase-08 chapters table.
// CITEXT slug ≤ 100 chars
// CITEXT name in translations ≤ 255 chars
// short_intro ≤ 1000 chars, long_intro ≤ 5000 chars
// prerequisites, learning_objectives as TEXT (optional)
// estimated_minutes as INT

const subjectIdSchema = z.number().int().positive();

const displayOrderSchema = z
  .number()
  .int()
  .min(-32768)
  .max(32767)
  .optional();

const estimatedMinutesSchema = z
  .number()
  .int()
  .min(0)
  .optional();

const difficultyLevelSchema = z
  .string()
  .trim()
  .optional();

const isActiveSchema = z.boolean().optional();

const noteSchema = z
  .string()
  .trim()
  .max(5000, 'note is too long')
  .optional();

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
  .max(1000, 'short intro is too long')
  .optional();

const longIntroSchema = z
  .string()
  .trim()
  .max(5000, 'long intro is too long')
  .optional();

const prerequisitesSchema = z
  .string()
  .trim()
  .optional();

const learningObjectivesSchema = z
  .string()
  .trim()
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

const tagsSchema = z.unknown().optional(); // JSONB, accepts array or object

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

export const CHAPTER_SORT_COLUMNS = [
  'id',
  'slug',
  'display_order',
  'difficulty_level',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const CHAPTER_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'chapter_id',
  'created_at'
] as const;

// ─── List chapters query ─────────────────────────────────────────

export const listChaptersQuerySchema = paginationSchema.extend({
  subjectId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  difficultyLevel: z.string().trim().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(CHAPTER_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListChaptersQuery = z.infer<typeof listChaptersQuerySchema>;

// ─── Create chapter body ────────────────────────────────────────

export const createChapterBodySchema = z.object({
  subjectId: subjectIdSchema,
  displayOrder: displayOrderSchema,
  difficultyLevel: difficultyLevelSchema,
  estimatedMinutes: estimatedMinutesSchema,
  isActive: isActiveSchema,
  note: noteSchema,
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
export type CreateChapterBody = z.infer<typeof createChapterBodySchema>;

// ─── Update chapter body ────────────────────────────────────────

export const updateChapterBodySchema = z.object({
  displayOrder: displayOrderSchema,
  difficultyLevel: difficultyLevelSchema,
  estimatedMinutes: estimatedMinutesSchema,
  isActive: isActiveSchema,
  note: noteSchema
});
export type UpdateChapterBody = z.infer<typeof updateChapterBodySchema>;

// ─── List chapter translations query ────────────────────────────

export const listChapterTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(CHAPTER_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListChapterTranslationsQuery = z.infer<typeof listChapterTranslationsQuerySchema>;

// ─── Create chapter translation body ────────────────────────────

export const createChapterTranslationBodySchema = z.object({
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
export type CreateChapterTranslationBody = z.infer<typeof createChapterTranslationBodySchema>;

// ─── Update chapter translation body ────────────────────────────

export const updateChapterTranslationBodySchema = z
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
export type UpdateChapterTranslationBody = z.infer<typeof updateChapterTranslationBodySchema>;
