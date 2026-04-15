// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/courses router (phase 09).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  isDeletedFilterSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

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
  .enum([
    'absolute beginner',
    'beginner',
    'intermediate',
    'advanced',
    'expert',
    'bootcamp',
    'mega'
  ])
  .optional();

const courseStatusSchema = z
  .enum(['draft', 'under_review', 'published', 'archived', 'suspended'])
  .optional();

const currencySchema = z
  .enum(['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'other'])
  .optional();

const priceSchema = z.number().min(0).max(99999999.99).optional();
const originalPriceSchema = z.number().min(0).max(99999999.99).optional();
const discountPercentageSchema = z.number().min(0).max(100).optional();
const durationHoursSchema = z.number().positive().max(999999.9).optional();
const maxStudentsSchema = z.number().int().positive().optional();
const refundDaysSchema = z.number().int().min(0).max(32767).optional();
const isActiveSchema = z.boolean().optional();

// Translation fields
const languageIdSchema = z.number().int().positive();

const titleSchema = z
  .string()
  .trim()
  .min(1, 'title is too short')
  .max(500, 'title is too long');

const shortIntroSchema = z
  .string()
  .trim()
  .max(5000, 'short intro is too long')
  .optional();

const longIntroSchema = z
  .string()
  .trim()
  .max(10000, 'long intro is too long')
  .optional();

const taglineSchema = z
  .string()
  .trim()
  .max(500, 'tagline is too long')
  .optional();

const urlSchema = z
  .string()
  .trim()
  .max(2000, 'URL is too long')
  .optional();

const videoTitleSchema = z
  .string()
  .trim()
  .max(500, 'video title is too long')
  .optional();

const videoDescriptionSchema = z
  .string()
  .trim()
  .max(2000, 'video description is too long')
  .optional();

const videoDurationMinutesSchema = z.number().positive().optional();

const tagsSchema = z.unknown().optional();

const isNewTitleSchema = z
  .string()
  .trim()
  .max(255, 'is new title is too long')
  .optional();

// JSONB array fields
const jsonbArraySchema = z.unknown().optional();

// SEO fields
const metaTitleSchema = z.string().trim().max(255, 'meta title is too long').optional();
const metaDescriptionSchema = z.string().trim().max(500, 'meta description is too long').optional();
const metaKeywordsSchema = z.string().trim().max(500, 'meta keywords is too long').optional();
const canonicalUrlSchema = z.string().trim().max(2000, 'canonical URL is too long').optional();
const ogSiteNameSchema = z.string().trim().max(500, 'og site name is too long').optional();
const ogTitleSchema = z.string().trim().max(255, 'og title is too long').optional();
const ogDescriptionSchema = z.string().trim().max(500, 'og description is too long').optional();
const ogTypeSchema = z.string().trim().max(100, 'og type is too long').optional();
const ogImageSchema = z.string().trim().max(2000, 'og image is too long').optional();
const ogUrlSchema = z.string().trim().max(2000, 'og URL is too long').optional();
const twitterSiteSchema = z.string().trim().max(255, 'twitter site is too long').optional();
const twitterTitleSchema = z.string().trim().max(255, 'twitter title is too long').optional();
const twitterDescriptionSchema = z.string().trim().max(500, 'twitter description is too long').optional();
const twitterImageSchema = z.string().trim().max(2000, 'twitter image is too long').optional();
const twitterCardSchema = z.string().trim().default('summary_large_image').optional();
const robotsDirectiveSchema = z.string().trim().default('index,follow').optional();
const focusKeywordSchema = z.string().trim().max(500, 'focus keyword is too long').optional();
const structuredDataSchema = z.unknown().optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const COURSE_SORT_COLUMNS = [
  'id',
  'code',
  'slug',
  'price',
  'rating_average',
  'enrollment_count',
  'created_at',
  'published_at',
  'updated_at'
] as const;

export const COURSE_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List courses query ─────────────────────────────────────────

export const listCoursesQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  difficultyLevel: z
    .enum(['absolute beginner', 'beginner', 'intermediate', 'advanced', 'expert', 'bootcamp', 'mega'])
    .optional(),
  courseStatus: z
    .enum(['draft', 'under_review', 'published', 'archived', 'suspended'])
    .optional(),
  isFree: queryBooleanSchema.optional(),
  currency: z
    .enum(['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'other'])
    .optional(),
  isInstructorCourse: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(COURSE_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

// ─── Create course body ─────────────────────────────────────────

export const createCourseBodySchema = z.object({
  instructorId: z.number().int().positive().optional(),
  courseLanguageId: z.number().int().positive().optional(),
  isInstructorCourse: z.boolean().optional(),
  code: codeSchema.optional(),
  slug: slugSchema.optional(),
  difficultyLevel: difficultyLevelSchema,
  courseStatus: courseStatusSchema,
  durationHours: durationHoursSchema,
  price: priceSchema,
  originalPrice: originalPriceSchema,
  discountPercentage: discountPercentageSchema,
  currency: currencySchema,
  isFree: z.boolean().optional(),
  trailerVideoUrl: urlSchema,
  trailerThumbnailUrl: urlSchema,
  videoUrl: urlSchema,
  brochureUrl: urlSchema,
  isNew: z.boolean().optional(),
  newUntil: z.string().optional(),
  isFeatured: z.boolean().optional(),
  isBestseller: z.boolean().optional(),
  hasPlacementAssistance: z.boolean().optional(),
  hasCertificate: z.boolean().optional(),
  maxStudents: maxStudentsSchema,
  refundDays: refundDaysSchema,
  isActive: isActiveSchema,
  publishedAt: z.string().optional(),
  contentUpdatedAt: z.string().optional(),
  // Optional embedded translation
  translation: z
    .object({
      languageId: languageIdSchema,
      title: titleSchema,
      shortIntro: shortIntroSchema,
      longIntro: longIntroSchema,
      tagline: taglineSchema,
      webThumbnail: urlSchema,
      webBanner: urlSchema,
      appThumbnail: urlSchema,
      appBanner: urlSchema,
      videoTitle: videoTitleSchema,
      videoDescription: videoDescriptionSchema,
      videoThumbnail: urlSchema,
      videoDurationMinutes: videoDurationMinutesSchema,
      tags: tagsSchema,
      isNewTitle: isNewTitleSchema,
      prerequisites: jsonbArraySchema,
      skillsGain: jsonbArraySchema,
      whatYouWillLearn: jsonbArraySchema,
      courseIncludes: jsonbArraySchema,
      courseIsFor: jsonbArraySchema,
      applyForDesignations: jsonbArraySchema,
      demandInCountries: jsonbArraySchema,
      salaryStandard: jsonbArraySchema,
      futureCourses: jsonbArraySchema,
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
export type CreateCourseBody = z.infer<typeof createCourseBodySchema>;

// ─── Update course body ─────────────────────────────────────────

// `.strict()` so callers learn about unknown fields immediately. Common
// mistakes this catches:
//   - title / shortIntro / etc. (these belong to course_translations —
//     PATCH /courses/:id/translations/:tid)
//   - instructorFullName (display-only field denormalised from the
//     joined instructor profile; change `instructorId` to swap the
//     instructor instead)
//   - ratingAverage / enrollmentCount / totalLessons (auto-maintained
//     aggregate columns — not user-settable)
export const updateCourseBodySchema = z.object({
  instructorId: z.number().int().positive().optional(),
  courseLanguageId: z.number().int().positive().optional(),
  isInstructorCourse: z.boolean().optional(),
  code: codeSchema.optional(),
  slug: slugSchema.optional(),
  difficultyLevel: difficultyLevelSchema,
  courseStatus: courseStatusSchema,
  durationHours: durationHoursSchema,
  price: priceSchema,
  originalPrice: originalPriceSchema,
  discountPercentage: discountPercentageSchema,
  currency: currencySchema,
  isFree: z.boolean().optional(),
  trailerVideoUrl: urlSchema,
  trailerThumbnailUrl: urlSchema,
  videoUrl: urlSchema,
  brochureUrl: urlSchema,
  isNew: z.boolean().optional(),
  newUntil: z.string().optional(),
  isFeatured: z.boolean().optional(),
  isBestseller: z.boolean().optional(),
  hasPlacementAssistance: z.boolean().optional(),
  hasCertificate: z.boolean().optional(),
  maxStudents: maxStudentsSchema,
  refundDays: refundDaysSchema,
  isActive: isActiveSchema,
  publishedAt: z.string().optional(),
  contentUpdatedAt: z.string().optional()
}).strict();
export type UpdateCourseBody = z.infer<typeof updateCourseBodySchema>;

// ─── List course translations query ─────────────────────────────

export const listCourseTranslationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  languageId: z.coerce.number().int().positive().optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(COURSE_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCourseTranslationsQuery = z.infer<typeof listCourseTranslationsQuerySchema>;

// ─── Create course translation body ─────────────────────────────

export const createCourseTranslationBodySchema = z.object({
  languageId: languageIdSchema,
  title: titleSchema,
  shortIntro: shortIntroSchema,
  longIntro: longIntroSchema,
  tagline: taglineSchema,
  webThumbnail: urlSchema,
  webBanner: urlSchema,
  appThumbnail: urlSchema,
  appBanner: urlSchema,
  videoTitle: videoTitleSchema,
  videoDescription: videoDescriptionSchema,
  videoThumbnail: urlSchema,
  videoDurationMinutes: videoDurationMinutesSchema,
  tags: tagsSchema,
  isNewTitle: isNewTitleSchema,
  prerequisites: jsonbArraySchema,
  skillsGain: jsonbArraySchema,
  whatYouWillLearn: jsonbArraySchema,
  courseIncludes: jsonbArraySchema,
  courseIsFor: jsonbArraySchema,
  applyForDesignations: jsonbArraySchema,
  demandInCountries: jsonbArraySchema,
  salaryStandard: jsonbArraySchema,
  futureCourses: jsonbArraySchema,
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
export type CreateCourseTranslationBody = z.infer<typeof createCourseTranslationBodySchema>;

// ─── Update course translation body ─────────────────────────────

export const updateCourseTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    shortIntro: shortIntroSchema,
    longIntro: longIntroSchema,
    tagline: taglineSchema,
    webThumbnail: urlSchema,
    webBanner: urlSchema,
    appThumbnail: urlSchema,
    appBanner: urlSchema,
    videoTitle: videoTitleSchema,
    videoDescription: videoDescriptionSchema,
    videoThumbnail: urlSchema,
    videoDurationMinutes: videoDurationMinutesSchema,
    tags: tagsSchema,
    isNewTitle: isNewTitleSchema,
    prerequisites: jsonbArraySchema,
    skillsGain: jsonbArraySchema,
    whatYouWillLearn: jsonbArraySchema,
    courseIncludes: jsonbArraySchema,
    courseIsFor: jsonbArraySchema,
    applyForDesignations: jsonbArraySchema,
    demandInCountries: jsonbArraySchema,
    salaryStandard: jsonbArraySchema,
    futureCourses: jsonbArraySchema,
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
// Note: empty-body check is enforced in the route handler so that a
// multipart PATCH carrying ONLY a file (no text fields) is accepted.
export type UpdateCourseTranslationBody = z.infer<typeof updateCourseTranslationBodySchema>;
