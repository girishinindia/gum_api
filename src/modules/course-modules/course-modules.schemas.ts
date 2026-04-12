// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/course-modules (phase 09).
// Parent: course_modules  |  Child: course_module_translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ─────────────────────────────────────────────────────

const nameSchema = z.string().min(1).max(500);
const slugSchema = z.string().min(1).max(255).optional();
const urlSchema = z.string().url().max(2048).optional();
const textSchema = z.string().max(10_000).optional();
const seoTextSchema = z.string().max(2000).optional();
const jsonbArraySchema = z.any().optional(); // JSONB arrays

// ─── Sort allowlists ───────────────────────────────────────────

export const MODULE_SORT_COLUMNS = [
  'id',
  'display_order',
  'slug',
  'created_at',
  'updated_at'
] as const;

export const MODULE_TRANSLATION_SORT_COLUMNS = [
  'id',
  'name',
  'language_id',
  'created_at',
  'updated_at'
] as const;

// ─── List modules query ────────────────────────────────────────

export const listCourseModulesQuerySchema = paginationSchema.extend({
  courseId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(MODULE_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseModulesQuery = z.infer<typeof listCourseModulesQuerySchema>;

// ─── Create module body ────────────────────────────────────────

const translationForCreateSchema = z.object({
  languageId: z.number().int().positive(),
  name: nameSchema,
  shortIntro: textSchema,
  description: textSchema,
  icon: urlSchema,
  image: urlSchema,
  tags: jsonbArraySchema,
  metaTitle: seoTextSchema,
  metaDescription: seoTextSchema,
  metaKeywords: seoTextSchema,
  canonicalUrl: urlSchema,
  ogSiteName: seoTextSchema,
  ogTitle: seoTextSchema,
  ogDescription: seoTextSchema,
  ogType: seoTextSchema,
  ogImage: urlSchema,
  ogUrl: urlSchema,
  twitterSite: seoTextSchema,
  twitterTitle: seoTextSchema,
  twitterDescription: seoTextSchema,
  twitterImage: urlSchema,
  twitterCard: seoTextSchema,
  robotsDirective: seoTextSchema,
  focusKeyword: seoTextSchema,
  structuredData: jsonbArraySchema,
  isActive: z.boolean().optional()
});

export const createCourseModuleBodySchema = z.object({
  courseId: z.number().int().positive(),
  slug: slugSchema,
  displayOrder: z.number().int().min(0).optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  translation: translationForCreateSchema.optional()
});
export type CreateCourseModuleBody = z.infer<typeof createCourseModuleBodySchema>;

// ─── Update module body ────────────────────────────────────────

export const updateCourseModuleBodySchema = z
  .object({
    slug: slugSchema,
    displayOrder: z.number().int().min(0).optional(),
    estimatedMinutes: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseModuleBody = z.infer<typeof updateCourseModuleBodySchema>;

// ─── List translations query ───────────────────────────────────

export const listCourseModuleTranslationsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(MODULE_TRANSLATION_SORT_COLUMNS).default('name'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseModuleTranslationsQuery = z.infer<typeof listCourseModuleTranslationsQuerySchema>;

// ─── Create translation body ───────────────────────────────────

export const createCourseModuleTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  name: nameSchema,
  shortIntro: textSchema,
  description: textSchema,
  icon: urlSchema,
  image: urlSchema,
  tags: jsonbArraySchema,
  metaTitle: seoTextSchema,
  metaDescription: seoTextSchema,
  metaKeywords: seoTextSchema,
  canonicalUrl: urlSchema,
  ogSiteName: seoTextSchema,
  ogTitle: seoTextSchema,
  ogDescription: seoTextSchema,
  ogType: seoTextSchema,
  ogImage: urlSchema,
  ogUrl: urlSchema,
  twitterSite: seoTextSchema,
  twitterTitle: seoTextSchema,
  twitterDescription: seoTextSchema,
  twitterImage: urlSchema,
  twitterCard: seoTextSchema,
  robotsDirective: seoTextSchema,
  focusKeyword: seoTextSchema,
  structuredData: jsonbArraySchema,
  isActive: z.boolean().optional()
});
export type CreateCourseModuleTranslationBody = z.infer<typeof createCourseModuleTranslationBodySchema>;

// ─── Update translation body ───────────────────────────────────

export const updateCourseModuleTranslationBodySchema = z
  .object({
    name: nameSchema.optional(),
    shortIntro: textSchema,
    description: textSchema,
    icon: urlSchema,
    image: urlSchema,
    tags: jsonbArraySchema,
    metaTitle: seoTextSchema,
    metaDescription: seoTextSchema,
    metaKeywords: seoTextSchema,
    canonicalUrl: urlSchema,
    ogSiteName: seoTextSchema,
    ogTitle: seoTextSchema,
    ogDescription: seoTextSchema,
    ogType: seoTextSchema,
    ogImage: urlSchema,
    ogUrl: urlSchema,
    twitterSite: seoTextSchema,
    twitterTitle: seoTextSchema,
    twitterDescription: seoTextSchema,
    twitterImage: urlSchema,
    twitterCard: seoTextSchema,
    robotsDirective: seoTextSchema,
    focusKeyword: seoTextSchema,
    structuredData: jsonbArraySchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCourseModuleTranslationBody = z.infer<typeof updateCourseModuleTranslationBodySchema>;
