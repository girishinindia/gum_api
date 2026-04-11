// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/categories router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Column length constraints from phase-02/13-categories/01_table.sql
// CITEXT code, slug ≤ 100 chars enforced by constraint
// CITEXT name ≤ 255 chars in translations
// description ≤ 5000 chars in translations

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

const displayOrderSchema = z
  .number()
  .int()
  .min(-32768)
  .max(32767)
  .optional();

const newUntilSchema = z.string().date().optional();

const isNewSchema = z.boolean().optional();
const isActiveSchema = z.boolean().optional();

// Translation fields - all optional except name and languageId
const languageIdSchema = z.number().int().positive();

const translationNameSchema = z
  .string()
  .trim()
  .min(1, 'translation name is too short')
  .max(255, 'translation name is too long');

const descriptionSchema = z
  .string()
  .trim()
  .max(5000, 'description is too long')
  .optional();

const isNewTitleSchema = z
  .string()
  .trim()
  .max(500, 'isNewTitle is too long')
  .optional();

const tagsSchema = z.unknown().optional(); // JSONB, accepts array or object

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

export const CATEGORY_SORT_COLUMNS = [
  'id',
  'code',
  'slug',
  'display_order',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const CATEGORY_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'category_id',
  'created_at'
] as const;

// ─── List category query ─────────────────────────────────────────

export const listCategoriesQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  isNew: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(CATEGORY_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

// ─── Create category body ────────────────────────────────────────

export const createCategoryBodySchema = z.object({
  code: codeSchema,
  slug: slugSchema.optional(),
  displayOrder: displayOrderSchema,
  isNew: isNewSchema,
  newUntil: newUntilSchema,
  isActive: isActiveSchema,
  // Optional embedded translation
  translation: z
    .object({
      languageId: languageIdSchema,
      name: translationNameSchema,
      description: descriptionSchema,
      isNewTitle: isNewTitleSchema,
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
      structuredData: structuredDataSchema
    })
    .optional()
});
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

// ─── Update category body ────────────────────────────────────────

export const updateCategoryBodySchema = z
  .object({
    code: codeSchema.optional(),
    slug: slugSchema.optional(),
    displayOrder: displayOrderSchema,
    isNew: isNewSchema,
    newUntil: newUntilSchema,
    isActive: isActiveSchema
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;

// ─── List category translations query ────────────────────────────

export const listCategoryTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  // Query param arrives as a string — coerce so `?languageId=1` works.
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(CATEGORY_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCategoryTranslationsQuery = z.infer<typeof listCategoryTranslationsQuerySchema>;

// ─── Create category translation body ────────────────────────────

export const createCategoryTranslationBodySchema = z.object({
  languageId: languageIdSchema,
  name: translationNameSchema,
  description: descriptionSchema,
  isNewTitle: isNewTitleSchema,
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
  structuredData: structuredDataSchema
});
export type CreateCategoryTranslationBody = z.infer<typeof createCategoryTranslationBodySchema>;

// ─── Update category translation body ────────────────────────────

export const updateCategoryTranslationBodySchema = z
  .object({
    name: translationNameSchema.optional(),
    description: descriptionSchema,
    isNewTitle: isNewTitleSchema,
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
    structuredData: structuredDataSchema,
    isActive: isActiveSchema
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCategoryTranslationBody = z.infer<typeof updateCategoryTranslationBodySchema>;
