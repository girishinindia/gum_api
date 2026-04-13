// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/assessments (phase 11).
// Assessments + nested translations sub-resource.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const assessmentTypeSchema = z.enum([
  'assignment',
  'mini_project',
  'capstone_project'
]);

const assessmentScopeSchema = z.enum(['chapter', 'module', 'course']);

const contentTypeSchema = z.enum([
  'coding',
  'github',
  'pdf',
  'image',
  'mixed'
]);

const difficultyLevelSchema = z.enum(['easy', 'medium', 'hard']);

const codeSchema = z
  .string()
  .trim()
  .min(1, 'code is too short')
  .max(100, 'code is too long');

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

// ─── Sort allowlist ──────────────────────────────────────────────

export const ASSESSMENT_SORT_COLUMNS = [
  'display_order',
  'code',
  'slug',
  'points',
  'difficulty_level',
  'due_days',
  'estimated_hours',
  'created_at',
  'updated_at',
  'title',
  'assessment_type',
  'assessment_scope',
  'content_type'
] as const;

export const ASSESSMENT_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List assessments query ─────────────────────────────────────

export const listAssessmentsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  assessmentType: assessmentTypeSchema.optional(),
  assessmentScope: assessmentScopeSchema.optional(),
  contentType: contentTypeSchema.optional(),
  difficultyLevel: difficultyLevelSchema.optional(),
  chapterId: z.coerce.number().int().positive().optional(),
  moduleId: z.coerce.number().int().positive().optional(),
  courseId: z.coerce.number().int().positive().optional(),
  isMandatory: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(ASSESSMENT_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;

// ─── Create assessment body ─────────────────────────────────────

export const createAssessmentBodySchema = z.object({
  assessmentType: assessmentTypeSchema.default('assignment'),
  assessmentScope: assessmentScopeSchema.default('chapter'),
  chapterId: z.number().int().positive().optional(),
  moduleId: z.number().int().positive().optional(),
  courseId: z.number().int().positive().optional(),
  contentType: contentTypeSchema.default('coding'),
  code: codeSchema.optional(),
  points: z.number().min(0).max(9999.99).optional(),
  difficultyLevel: difficultyLevelSchema.optional(),
  dueDays: z.number().int().min(0).max(32767).optional(),
  estimatedHours: z.number().min(0).max(99999.9).optional(),
  isMandatory: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateAssessmentBody = z.infer<typeof createAssessmentBodySchema>;

// ─── Update assessment body ─────────────────────────────────────

export const updateAssessmentBodySchema = z
  .object({
    assessmentType: assessmentTypeSchema.optional(),
    contentType: contentTypeSchema.optional(),
    code: codeSchema.optional(),
    points: z.number().min(0).max(9999.99).optional(),
    difficultyLevel: difficultyLevelSchema.optional(),
    dueDays: z.number().int().min(0).max(32767).optional(),
    estimatedHours: z.number().min(0).max(99999.9).optional(),
    isMandatory: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateAssessmentBody = z.infer<typeof updateAssessmentBodySchema>;

// ─── List assessment translations query ─────────────────────────

export const listAssessmentTranslationsQuerySchema = paginationSchema.extend({
  languageId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(ASSESSMENT_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListAssessmentTranslationsQuery = z.infer<typeof listAssessmentTranslationsQuerySchema>;

// ─── Create assessment translation body ─────────────────────────

export const createAssessmentTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: z.string().trim().max(10000).optional(),
  instructions: z.string().trim().max(10000).optional(),
  techStack: jsonbArraySchema,
  learningOutcomes: jsonbArraySchema,
  image1: urlSchema,
  image2: urlSchema,
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
export type CreateAssessmentTranslationBody = z.infer<typeof createAssessmentTranslationBodySchema>;

// ─── Update assessment translation body ─────────────────────────

export const updateAssessmentTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(10000).optional(),
    instructions: z.string().trim().max(10000).optional(),
    techStack: jsonbArraySchema,
    learningOutcomes: jsonbArraySchema,
    image1: urlSchema,
    image2: urlSchema,
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
export type UpdateAssessmentTranslationBody = z.infer<typeof updateAssessmentTranslationBodySchema>;
