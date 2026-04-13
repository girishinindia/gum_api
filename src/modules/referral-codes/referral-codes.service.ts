// ═══════════════════════════════════════════════════════════════
// referral-codes.service — UDF wrappers for /api/v1/referral-codes
//
// Provides CRUD for referral codes.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateReferralCodeBody,
  ListReferralCodesQuery,
  UpdateReferralCodeBody
} from './referral-codes.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface ReferralCodeDto {
  id: number;
  studentId: number;
  referralCode: string;
  discountPercentage: number | null;
  maxDiscountAmount: number | null;
  referrerRewardPercentage: number | null;
  referrerRewardType: string | null;
  totalReferrals: number;
  successfulReferrals: number;
  totalEarnings: number;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  studentName: string | null;
}

// ─── Internal Row Interfaces ─────────────────────────────────────

interface ReferralCodeRow {
  total_count?: number | string;
  rc_id: number | string;
  rc_student_id: number | string;
  rc_referral_code: string;
  rc_discount_percentage: number | null;
  rc_max_discount_amount: number | null;
  rc_referrer_reward_percentage: number | null;
  rc_referrer_reward_type: string | null;
  rc_total_referrals: number | string;
  rc_successful_referrals: number | string;
  rc_total_earnings: number | string;
  rc_created_by: number | null;
  rc_updated_by: number | null;
  rc_is_active: boolean;
  rc_is_deleted: boolean;
  rc_created_at: Date | string | null;
  rc_updated_at: Date | string | null;
  rc_deleted_at: Date | string | null;
  rc_student_name: string | null;
}

// ─── Mappers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapReferralCodeRow = (row: ReferralCodeRow): ReferralCodeDto => ({
  id: Number(row.rc_id),
  studentId: Number(row.rc_student_id),
  referralCode: row.rc_referral_code,
  discountPercentage: row.rc_discount_percentage,
  maxDiscountAmount: row.rc_max_discount_amount,
  referrerRewardPercentage: row.rc_referrer_reward_percentage,
  referrerRewardType: row.rc_referrer_reward_type,
  totalReferrals: Number(row.rc_total_referrals),
  successfulReferrals: Number(row.rc_successful_referrals),
  totalEarnings: Number(row.rc_total_earnings),
  createdBy: row.rc_created_by,
  updatedBy: row.rc_updated_by,
  isActive: row.rc_is_active,
  isDeleted: row.rc_is_deleted,
  createdAt: toIso(row.rc_created_at),
  updatedAt: toIso(row.rc_updated_at),
  deletedAt: toIso(row.rc_deleted_at),
  studentName: row.rc_student_name
});

// ─── List Result ─────────────────────────────────────────────────

export interface ListResult {
  rows: ReferralCodeDto[];
  meta: PaginationMeta;
}

// ─── Referral Code CRUD ──────────────────────────────────────────

export const listReferralCodes = async (
  q: ListReferralCodesQuery
): Promise<ListResult> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<ReferralCodeRow>(
    'udf_get_referral_codes',
    {
      p_id: null,
      p_filter_student_id: q.studentId ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_filter_referrer_reward_type: q.referrerRewardType ?? null,
      p_search_query: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapReferralCodeRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getReferralCodeById = async (
  id: number
): Promise<ReferralCodeDto | null> => {
  const { rows } = await db.callTableFunction<ReferralCodeRow>(
    'udf_get_referral_codes',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapReferralCodeRow(row) : null;
};

export const createReferralCode = async (
  body: CreateReferralCodeBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_referral_codes', {
    p_student_id: body.studentId,
    p_referral_code: body.referralCode ?? null,
    p_discount_percentage: body.discountPercentage ?? null,
    p_max_discount_amount: body.maxDiscountAmount ?? null,
    p_referrer_reward_percentage: body.referrerRewardPercentage ?? null,
    p_referrer_reward_type: body.referrerRewardType ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateReferralCode = async (
  id: number,
  body: UpdateReferralCodeBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_referral_codes', {
    p_id: id,
    p_discount_percentage: body.discountPercentage ?? null,
    p_max_discount_amount: body.maxDiscountAmount ?? null,
    p_referrer_reward_percentage: body.referrerRewardPercentage ?? null,
    p_referrer_reward_type: body.referrerRewardType ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteReferralCode = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_referral_codes', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreReferralCode = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_referral_codes', {
    p_id: id,
    p_actor_id: callerId
  });
};
