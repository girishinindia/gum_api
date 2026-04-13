// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/coupons (phase 16).
// Coupons + Coupon Translations + Coupon Courses + Coupon Bundles +
// Coupon Batches + Coupon Webinars.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const discountTypeSchema = z.enum(['percentage', 'fixed_amount']);

const applicableToSchema = z.enum(['all', 'course', 'bundle', 'batch', 'webinar']);

const codeSchema = z
  .string()
  .trim()
  .min(1, 'coupon code is too short')
  .max(100, 'coupon code is too long');

const titleSchema = z
  .string()
  .trim()
  .min(1, 'title is too short')
  .max(500, 'title is too long');

const descriptionSchema = z
  .string()
  .trim()
  .max(10000, 'description is too long')
  .optional();

// ─── Sort allowlists ─────────────────────────────────────────────

export const COUPON_SORT_COLUMNS = [
  'id',
  'code',
  'discount_value',
  'used_count',
  'created_at',
  'updated_at'
] as const;

export const COUPON_TRANSLATION_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

export const COUPON_COURSE_SORT_COLUMNS = [
  'id',
  'coupon_id',
  'course_id',
  'display_order',
  'created_at',
  'updated_at'
] as const;

export const COUPON_BUNDLE_SORT_COLUMNS = [
  'id',
  'coupon_id',
  'bundle_id',
  'display_order',
  'created_at',
  'updated_at'
] as const;

export const COUPON_BATCH_SORT_COLUMNS = [
  'id',
  'coupon_id',
  'batch_id',
  'display_order',
  'created_at',
  'updated_at'
] as const;

export const COUPON_WEBINAR_SORT_COLUMNS = [
  'id',
  'coupon_id',
  'webinar_id',
  'display_order',
  'created_at',
  'updated_at'
] as const;

// ─── List coupons query ───────────────────────────────────────────

export const listCouponsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COUPON_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  searchTerm: searchTermSchema.optional(),
  code: z.string().trim().optional(),
  discountType: discountTypeSchema.optional(),
  applicableTo: applicableToSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional()
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

// ─── Create coupon body ────────────────────────────────────────────

export const createCouponBodySchema = z.object({
  code: codeSchema,
  discountType: discountTypeSchema,
  discountValue: z.number().min(0).max(99999999.99),
  minPurchaseAmount: z.number().min(0).max(99999999.99).optional(),
  maxDiscountAmount: z.number().min(0).max(99999999.99).optional(),
  applicableTo: applicableToSchema.optional(),
  usageLimit: z.number().int().min(0).optional(),
  usagePerUser: z.number().int().min(0).max(32767).optional(),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  isActive: z.boolean().optional()
});
export type CreateCouponBody = z.infer<typeof createCouponBodySchema>;

// ─── Update coupon body ────────────────────────────────────────────

export const updateCouponBodySchema = z
  .object({
    discountValue: z.number().min(0).max(99999999.99).optional(),
    minPurchaseAmount: z.number().min(0).max(99999999.99).optional(),
    maxDiscountAmount: z.number().min(0).max(99999999.99).optional(),
    usageLimit: z.number().int().min(0).optional(),
    usagePerUser: z.number().int().min(0).max(32767).optional(),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCouponBody = z.infer<typeof updateCouponBodySchema>;

// ─── List coupon translations query ────────────────────────────────

export const listCouponTranslationsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COUPON_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListCouponTranslationsQuery = z.infer<typeof listCouponTranslationsQuerySchema>;

// ─── Create coupon translation body ────────────────────────────────

export const createCouponTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  title: titleSchema,
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreateCouponTranslationBody = z.infer<typeof createCouponTranslationBodySchema>;

// ─── Update coupon translation body ────────────────────────────────

export const updateCouponTranslationBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCouponTranslationBody = z.infer<typeof updateCouponTranslationBodySchema>;

// ─── List coupon courses query ─────────────────────────────────────

export const listCouponCoursesQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COUPON_COURSE_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  courseId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema.optional()
});
export type ListCouponCoursesQuery = z.infer<typeof listCouponCoursesQuerySchema>;

// ─── Create coupon course body ─────────────────────────────────────

export const createCouponCourseBodySchema = z.object({
  courseId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateCouponCourseBody = z.infer<typeof createCouponCourseBodySchema>;

// ─── Update coupon course body ─────────────────────────────────────

export const updateCouponCourseBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCouponCourseBody = z.infer<typeof updateCouponCourseBodySchema>;

// ─── List coupon bundles query ─────────────────────────────────────

export const listCouponBundlesQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COUPON_BUNDLE_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  bundleId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema.optional()
});
export type ListCouponBundlesQuery = z.infer<typeof listCouponBundlesQuerySchema>;

// ─── Create coupon bundle body ─────────────────────────────────────

export const createCouponBundleBodySchema = z.object({
  bundleId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateCouponBundleBody = z.infer<typeof createCouponBundleBodySchema>;

// ─── Update coupon bundle body ─────────────────────────────────────

export const updateCouponBundleBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCouponBundleBody = z.infer<typeof updateCouponBundleBodySchema>;

// ─── List coupon batches query ─────────────────────────────────────

export const listCouponBatchesQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COUPON_BATCH_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  batchId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema.optional()
});
export type ListCouponBatchesQuery = z.infer<typeof listCouponBatchesQuerySchema>;

// ─── Create coupon batch body ──────────────────────────────────────

export const createCouponBatchBodySchema = z.object({
  batchId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateCouponBatchBody = z.infer<typeof createCouponBatchBodySchema>;

// ─── Update coupon batch body ──────────────────────────────────────

export const updateCouponBatchBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCouponBatchBody = z.infer<typeof updateCouponBatchBodySchema>;

// ─── List coupon webinars query ────────────────────────────────────

export const listCouponWebinarsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(COUPON_WEBINAR_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  webinarId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema.optional()
});
export type ListCouponWebinarsQuery = z.infer<typeof listCouponWebinarsQuerySchema>;

// ─── Create coupon webinar body ────────────────────────────────────

export const createCouponWebinarBodySchema = z.object({
  webinarId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreateCouponWebinarBody = z.infer<typeof createCouponWebinarBodySchema>;

// ─── Update coupon webinar body ────────────────────────────────────

export const updateCouponWebinarBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateCouponWebinarBody = z.infer<typeof updateCouponWebinarBodySchema>;
