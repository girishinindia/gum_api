// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/referral-codes (phase 15).
// Referral Codes CRUD.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const referrerRewardTypeSchema = z.enum([
  'wallet_credit',
  'discount_code',
  'cashback'
]);

const referralCodeSchema = z
  .string()
  .trim()
  .min(1, 'referral code is too short')
  .max(100, 'referral code is too long')
  .optional();

const discountPercentageSchema = z
  .number()
  .min(0)
  .max(100)
  .optional();

const maxDiscountAmountSchema = z
  .number()
  .min(0)
  .max(99999999.99)
  .optional();

const rewardPercentageSchema = z
  .number()
  .min(0)
  .max(100)
  .optional();

// ─── Sort allowlists ─────────────────────────────────────────────

export const REFERRAL_CODE_SORT_COLUMNS = [
  'id',
  'student_id',
  'discount_percentage',
  'total_referrals',
  'successful_referrals',
  'total_earnings',
  'created_at',
  'updated_at'
] as const;

// ─── List referral codes query ───────────────────────────────────

export const listReferralCodesQuerySchema = paginationSchema.extend({
  sortColumn: z.enum(REFERRAL_CODE_SORT_COLUMNS).default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC'),
  searchTerm: searchTermSchema,
  studentId: z.coerce.number().int().positive().optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  referrerRewardType: referrerRewardTypeSchema.optional()
});
export type ListReferralCodesQuery = z.infer<typeof listReferralCodesQuerySchema>;

// ─── Create referral code body ───────────────────────────────────

export const createReferralCodeBodySchema = z.object({
  studentId: z.number().int().positive(),
  referralCode: referralCodeSchema,
  discountPercentage: discountPercentageSchema,
  maxDiscountAmount: maxDiscountAmountSchema,
  referrerRewardPercentage: rewardPercentageSchema,
  referrerRewardType: referrerRewardTypeSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateReferralCodeBody = z.infer<typeof createReferralCodeBodySchema>;

// ─── Update referral code body ───────────────────────────────────

export const updateReferralCodeBodySchema = z
  .object({
    discountPercentage: discountPercentageSchema,
    maxDiscountAmount: maxDiscountAmountSchema,
    referrerRewardPercentage: rewardPercentageSchema,
    referrerRewardType: referrerRewardTypeSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateReferralCodeBody = z.infer<typeof updateReferralCodeBodySchema>;
