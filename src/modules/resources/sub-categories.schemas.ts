// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/sub-categories router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Column length constraints from phase-02/14-sub-categories/01_table.sql
// CITEXT code, slug ≤ 100 chars enforced by constraint
// CITEXT name ≤ 255 chars in translations
// description ≤ 5000 chars in translations
// FK: category_id REQUIRED for parent

const categoryIdSchema = z.number().int().positive('categoryId must be a positive integer');

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

export const SUB_CATEGORY_SORT_COLUMNS = [
  'id',
  'code',
  'slug',
  'display_order',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const SUB_CATEGORY_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'sub_category_id',
  'created_at'
] as const;

// ─── List sub-category query ────────────────────────────────────

export const listSubCategoriesQuerySchema = paginationSchema.extend({
  // Query params arrive as strings — coerce so `?categoryId=42` works.
  categoryId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  isNew: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SUB_CATEGORY_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSubCategoriesQuery = z.infer<typeof listSubCategoriesQuerySchema>;

// ─── Create sub-category body ───────────────────────────────────

export const createSubCategoryBodySchema = z.object({
  categoryId: categoryIdSchema,
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
export type CreateSubCategoryBody = z.infer<typeof createSubCategoryBodySchema>;

// ─── Update sub-category body ───────────────────────────────────

export const updateSubCategoryBodySchema = z
  .object({
    categoryId: categoryIdSchema.optional(),
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
export type UpdateSubCategoryBody = z.infer<typeof updateSubCategoryBodySchema>;

// ─── List sub-category translations query ───────────────────────

export const listSubCategoryTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  // Query param arrives as a string — coerce so `?languageId=1` works.
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SUB_CATEGORY_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSubCategoryTranslationsQuery = z.infer<typeof listSubCategoryTranslationsQuerySchema>;

// ─── Create sub-category translation body ────────────────────────

export const createSubCategoryTranslationBodySchema = z.object({
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
export type CreateSubCategoryTranslationBody = z.infer<typeof createSubCategoryTranslationBodySchema>;

// ─── Update sub-category translation body ────────────────────────

export const updateSubCategoryTranslationBodySchema = z
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
export type UpdateSubCategoryTranslationBody = z.infer<typeof updateSubCategoryTranslationBodySchema>;
