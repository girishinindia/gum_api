// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/instructor-promotions (phase 14).
// Instructor Promotions + Promotion Translations + Promotion Courses.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const discountTypeSchema = z.enum(['percentage', 'fixed_amount']);

const applicableToSchema = z.enum([
  'all_my_courses',
  'specific_courses',
  'all_my_internships',
  'specific_internships'
]);

const promotionStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'active',
  'expired',
  'cancelled',
  'rejected'
]);

const promoCodeSchema = z
  .string()
  .trim()
  .min(1, 'promo code is too short')
  .max(100, 'promo code is too long');

const promotionNameSchema = z
  .string()
  .trim()
  .min(1, 'promotion name is too short')
  .max(500, 'promotion name is too long');

const descriptionSchema = z
  .string()
  .trim()
  .max(10000, 'description is too long')
  .optional();

// ─── Sort allowlists ─────────────────────────────────────────────

export const INSTRUCTOR_PROMOTION_SORT_COLUMNS = [
  'id',
  'instructor_id',
  'promo_code',
  'discount_value',
  'discount_type',
  'promotion_status',
  'valid_from',
  'valid_until',
  'used_count',
  'created_at',
  'updated_at'
] as const;

export const PROMOTION_TRANSLATION_SORT_COLUMNS = [
  'id',
  'promotion_name',
  'created_at',
  'updated_at'
] as const;

export const PROMOTION_COURSE_SORT_COLUMNS = [
  'id',
  'promotion_id',
  'course_id',
  'display_order',
  'created_at',
  'updated_at'
] as const;

// ─── List instructor promotions query ──────────────────────────────

export const listInstructorPromotionsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(INSTRUCTOR_PROMOTION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  searchQuery: searchTermSchema,
  instructorId: z.coerce.number().int().positive().optional(),
  promotionStatus: promotionStatusSchema.optional(),
  discountType: discountTypeSchema.optional(),
  applicableTo: applicableToSchema.optional(),
  isDeleted: queryBooleanSchema.optional()
});
export type ListInstructorPromotionsQuery = z.infer<typeof listInstructorPromotionsQuerySchema>;

// ─── Create instructor promotion body ────────────────────────────────

export const createInstructorPromotionBodySchema = z.object({
  instructorId: z.number().int().positive(),
  promoCode: promoCodeSchema.optional(),
  discountType: discountTypeSchema,
  discountValue: z.number().min(0).max(99999999.99),
  maxDiscountAmount: z.number().min(0).max(99999999.99).optional(),
  minPurchaseAmount: z.number().min(0).max(99999999.99).optional(),
  applicableTo: applicableToSchema.optional(),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
  usageLimit: z.number().int().min(0).optional(),
  usagePerUser: z.number().int().min(0).max(32767).optional(),
  promotionStatus: promotionStatusSchema.optional(),
  requiresApproval: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateInstructorPromotionBody = z.infer<typeof createInstructorPromotionBodySchema>;

// ─── Update instructor promotion body ────────────────────────────────

export const updateInstructorPromotionBodySchema = z
  .object({
    promoCode: z.string().trim().max(100).optional(),
    discountType: discountTypeSchema.optional(),
    discountValue: z.number().min(0).max(99999999.99).optional(),
    maxDiscountAmount: z.number().min(0).max(99999999.99).optional(),
    minPurchaseAmount: z.number().min(0).max(99999999.99).optional(),
    applicableTo: applicableToSchema.optional(),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    usageLimit: z.number().int().min(0).optional(),
    usagePerUser: z.number().int().min(0).max(32767).optional(),
    promotionStatus: promotionStatusSchema.optional(),
    requiresApproval: z.boolean().optional(),
    approvedBy: z.number().int().positive().optional(),
    approvedAt: z.string().datetime({ offset: true }).optional(),
    rejectionReason: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateInstructorPromotionBody = z.infer<typeof updateInstructorPromotionBodySchema>;

// ─── List promotion translations query ─────────────────────────────

export const listPromotionTranslationsQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(PROMOTION_TRANSLATION_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListPromotionTranslationsQuery = z.infer<typeof listPromotionTranslationsQuerySchema>;

// ─── Create promotion translation body ─────────────────────────────

export const createPromotionTranslationBodySchema = z.object({
  languageId: z.number().int().positive(),
  promotionName: promotionNameSchema,
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreatePromotionTranslationBody = z.infer<typeof createPromotionTranslationBodySchema>;

// ─── Update promotion translation body ─────────────────────────────

export const updatePromotionTranslationBodySchema = z
  .object({
    promotionName: promotionNameSchema.optional(),
    description: descriptionSchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdatePromotionTranslationBody = z.infer<typeof updatePromotionTranslationBodySchema>;

// ─── List promotion courses query ──────────────────────────────────

export const listPromotionCoursesQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(PROMOTION_COURSE_SORT_COLUMNS).default('display_order'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  courseId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional()
});
export type ListPromotionCoursesQuery = z.infer<typeof listPromotionCoursesQuerySchema>;

// ─── Create promotion course body ──────────────────────────────────

export const createPromotionCourseBodySchema = z.object({
  courseId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).max(32767).optional(),
  isActive: z.boolean().optional()
});
export type CreatePromotionCourseBody = z.infer<typeof createPromotionCourseBodySchema>;

// ─── Update promotion course body ──────────────────────────────────

export const updatePromotionCourseBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).max(32767).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdatePromotionCourseBody = z.infer<typeof updatePromotionCourseBodySchema>;
