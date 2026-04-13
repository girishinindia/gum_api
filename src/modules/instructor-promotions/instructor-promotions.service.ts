// ═══════════════════════════════════════════════════════════════
// instructor-promotions.service — UDF wrappers for /api/v1/instructor-promotions
//
// Provides CRUD for instructor promotions + promotion translations +
// promotion courses.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateInstructorPromotionBody,
  CreatePromotionTranslationBody,
  CreatePromotionCourseBody,
  ListInstructorPromotionsQuery,
  ListPromotionTranslationsQuery,
  ListPromotionCoursesQuery,
  UpdateInstructorPromotionBody,
  UpdatePromotionTranslationBody,
  UpdatePromotionCourseBody
} from './instructor-promotions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface InstructorPromotionDto {
  id: number;
  instructorId: number;
  instructorFirstName: string | null;
  instructorLastName: string | null;
  instructorEmail: string | null;
  promoCode: string | null;
  slug: string | null;
  discountType: string;
  discountValue: number;
  maxDiscountAmount: number | null;
  minPurchaseAmount: number | null;
  applicableTo: string | null;
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: number | null;
  usagePerUser: number | null;
  usedCount: number;
  promotionStatus: string;
  requiresApproval: boolean;
  approvedBy: number | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface PromotionTranslationDto {
  id: number;
  promotionId: number;
  languageId: number;
  promotionName: string;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  languageName: string | null;
  languageIsoCode: string | null;
  languageNativeName: string | null;
}

export interface PromotionCourseDto {
  id: number;
  promotionId: number;
  courseId: number;
  displayOrder: number;
  promoCode: string | null;
  discountType: string;
  discountValue: number;
  courseCode: string | null;
  courseSlug: string | null;
  coursePrice: number;
  courseStatus: string;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

// ─── Internal Row Interfaces ─────────────────────────────────────

interface InstructorPromotionRow {
  total_count?: number | string;
  ip_id: number | string;
  ip_instructor_id: number | string;
  ip_instructor_first_name: string | null;
  ip_instructor_last_name: string | null;
  ip_instructor_email: string | null;
  ip_promo_code: string | null;
  ip_slug: string | null;
  ip_discount_type: string;
  ip_discount_value: number | string;
  ip_max_discount_amount: number | string | null;
  ip_min_purchase_amount: number | string | null;
  ip_applicable_to: string | null;
  ip_valid_from: Date | string | null;
  ip_valid_until: Date | string | null;
  ip_usage_limit: number | string | null;
  ip_usage_per_user: number | string | null;
  ip_used_count: number | string;
  ip_promotion_status: string;
  ip_requires_approval: boolean;
  ip_approved_by: number | null;
  ip_approved_at: Date | string | null;
  ip_rejection_reason: string | null;
  ip_created_by: number | null;
  ip_updated_by: number | null;
  ip_is_active: boolean;
  ip_is_deleted: boolean;
  ip_created_at: Date | string | null;
  ip_updated_at: Date | string | null;
  ip_deleted_at: Date | string | null;
}

interface PromotionTranslationRow {
  total_count?: number | string;
  instr_prom_trans_id: number | string;
  instr_prom_trans_promotion_id: number | string;
  instr_prom_trans_language_id: number | string;
  instr_prom_trans_promotion_name: string;
  instr_prom_trans_description: string | null;
  instr_prom_trans_is_active: boolean;
  instr_prom_trans_is_deleted: boolean;
  instr_prom_trans_created_at: Date | string | null;
  instr_prom_trans_updated_at: Date | string | null;
  instr_prom_trans_deleted_at: Date | string | null;
  language_id: number | string;
  language_name: string | null;
  language_iso_code: string | null;
  language_native_name: string | null;
}

interface PromotionCourseRow {
  total_count?: number | string;
  ipc_id: number | string;
  ipc_promotion_id: number | string;
  ipc_course_id: number | string;
  ipc_display_order: number | string;
  ipc_created_by: number | null;
  ipc_updated_by: number | null;
  ipc_is_active: boolean;
  ipc_is_deleted: boolean;
  ipc_created_at: Date | string | null;
  ipc_updated_at: Date | string | null;
  promotion_promo_code: string | null;
  promotion_discount_type: string;
  promotion_discount_value: number | string;
  course_code: string | null;
  course_slug: string | null;
  course_price: number | string;
  course_status: string;
}

// ─── Mappers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapInstructorPromotionRow = (row: InstructorPromotionRow): InstructorPromotionDto => ({
  id: Number(row.ip_id),
  instructorId: Number(row.ip_instructor_id),
  instructorFirstName: row.ip_instructor_first_name,
  instructorLastName: row.ip_instructor_last_name,
  instructorEmail: row.ip_instructor_email,
  promoCode: row.ip_promo_code,
  slug: row.ip_slug,
  discountType: row.ip_discount_type,
  discountValue: Number(row.ip_discount_value),
  maxDiscountAmount: row.ip_max_discount_amount != null ? Number(row.ip_max_discount_amount) : null,
  minPurchaseAmount: row.ip_min_purchase_amount != null ? Number(row.ip_min_purchase_amount) : null,
  applicableTo: row.ip_applicable_to,
  validFrom: toIso(row.ip_valid_from),
  validUntil: toIso(row.ip_valid_until),
  usageLimit: row.ip_usage_limit != null ? Number(row.ip_usage_limit) : null,
  usagePerUser: row.ip_usage_per_user != null ? Number(row.ip_usage_per_user) : null,
  usedCount: Number(row.ip_used_count),
  promotionStatus: row.ip_promotion_status,
  requiresApproval: row.ip_requires_approval,
  approvedBy: row.ip_approved_by,
  approvedAt: toIso(row.ip_approved_at),
  rejectionReason: row.ip_rejection_reason,
  createdBy: row.ip_created_by,
  updatedBy: row.ip_updated_by,
  isActive: row.ip_is_active,
  isDeleted: row.ip_is_deleted,
  createdAt: toIso(row.ip_created_at),
  updatedAt: toIso(row.ip_updated_at),
  deletedAt: toIso(row.ip_deleted_at)
});

const mapPromotionTranslationRow = (row: PromotionTranslationRow): PromotionTranslationDto => ({
  id: Number(row.instr_prom_trans_id),
  promotionId: Number(row.instr_prom_trans_promotion_id),
  languageId: Number(row.instr_prom_trans_language_id),
  promotionName: row.instr_prom_trans_promotion_name,
  description: row.instr_prom_trans_description,
  isActive: row.instr_prom_trans_is_active,
  isDeleted: row.instr_prom_trans_is_deleted,
  createdAt: toIso(row.instr_prom_trans_created_at),
  updatedAt: toIso(row.instr_prom_trans_updated_at),
  deletedAt: toIso(row.instr_prom_trans_deleted_at),
  languageName: row.language_name,
  languageIsoCode: row.language_iso_code,
  languageNativeName: row.language_native_name
});

const mapPromotionCourseRow = (row: PromotionCourseRow): PromotionCourseDto => ({
  id: Number(row.ipc_id),
  promotionId: Number(row.ipc_promotion_id),
  courseId: Number(row.ipc_course_id),
  displayOrder: Number(row.ipc_display_order),
  promoCode: row.promotion_promo_code,
  discountType: row.promotion_discount_type,
  discountValue: Number(row.promotion_discount_value),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  coursePrice: Number(row.course_price),
  courseStatus: row.course_status,
  createdBy: row.ipc_created_by,
  updatedBy: row.ipc_updated_by,
  isActive: row.ipc_is_active,
  isDeleted: row.ipc_is_deleted,
  createdAt: toIso(row.ipc_created_at),
  updatedAt: toIso(row.ipc_updated_at)
});

// ─── List Result ─────────────────────────────────────────────────

export interface ListResult {
  rows: unknown[];
  meta: PaginationMeta;
}

// ─── Instructor Promotion CRUD ──────────────────────────────────

export const listInstructorPromotions = async (
  q: ListInstructorPromotionsQuery
): Promise<{ rows: InstructorPromotionDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<InstructorPromotionRow>(
    'udf_get_instructor_promotions',
    {
      p_id: null,
      p_filter_instructor_id: q.instructorId ?? null,
      p_filter_promotion_status: q.promotionStatus ?? null,
      p_filter_discount_type: q.discountType ?? null,
      p_filter_applicable_to: q.applicableTo ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchQuery ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapInstructorPromotionRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getInstructorPromotionById = async (
  id: number
): Promise<InstructorPromotionDto | null> => {
  const { rows } = await db.callTableFunction<InstructorPromotionRow>(
    'udf_get_instructor_promotions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapInstructorPromotionRow(row) : null;
};

export const createInstructorPromotion = async (
  body: CreateInstructorPromotionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_instructor_promotions', {
    p_instructor_id: body.instructorId,
    p_promo_code: body.promoCode ?? null,
    p_discount_type: body.discountType,
    p_discount_value: body.discountValue,
    p_max_discount_amount: body.maxDiscountAmount ?? null,
    p_min_purchase_amount: body.minPurchaseAmount ?? null,
    p_applicable_to: body.applicableTo ?? null,
    p_valid_from: body.validFrom,
    p_valid_until: body.validUntil,
    p_usage_limit: body.usageLimit ?? null,
    p_usage_per_user: body.usagePerUser ?? null,
    p_promotion_status: body.promotionStatus ?? null,
    p_requires_approval: body.requiresApproval ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateInstructorPromotion = async (
  id: number,
  body: UpdateInstructorPromotionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_instructor_promotions', {
    p_id: id,
    p_promo_code: body.promoCode !== undefined ? (body.promoCode ?? '') : null,
    p_discount_type: body.discountType ?? null,
    p_discount_value: body.discountValue ?? null,
    p_max_discount_amount: body.maxDiscountAmount ?? null,
    p_min_purchase_amount: body.minPurchaseAmount ?? null,
    p_applicable_to: body.applicableTo ?? null,
    p_valid_from: body.validFrom ?? null,
    p_valid_until: body.validUntil ?? null,
    p_usage_limit: body.usageLimit ?? null,
    p_usage_per_user: body.usagePerUser ?? null,
    p_promotion_status: body.promotionStatus ?? null,
    p_requires_approval: body.requiresApproval ?? null,
    p_approved_by: body.approvedBy ?? null,
    p_approved_at: body.approvedAt ?? null,
    p_rejection_reason: body.rejectionReason !== undefined ? (body.rejectionReason ?? '__CLEAR__') : null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteInstructorPromotion = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_instructor_promotions', { p_id: id });
};

export const restoreInstructorPromotion = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_instructor_promotions', { p_id: id });
};

// ─── Promotion Translation CRUD ────────────────────────────────────

export const listPromotionTranslations = async (
  promotionId: number,
  q: ListPromotionTranslationsQuery
): Promise<{ rows: PromotionTranslationDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const sortColumnMap: Record<string, string> = {
    id: 'instr_prom_trans_id',
    promotion_name: 'instr_prom_trans_promotion_name',
    created_at: 'instr_prom_trans_created_at',
    updated_at: 'instr_prom_trans_updated_at'
  };
  const sortColumn = sortColumnMap[q.sortColumn] || 'instr_prom_trans_created_at';

  const result = await db.query<PromotionTranslationRow>(
    `
      SELECT *, COUNT(*) OVER()::INT AS total_count
      FROM uv_instructor_promotion_translations
      WHERE instr_prom_trans_promotion_id = $1
      ORDER BY ${sortColumn} ${q.sortDirection}
      LIMIT $2 OFFSET $3
    `,
    [promotionId, q.pageSize, offset]
  );

  return {
    rows: result.rows.map(mapPromotionTranslationRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, result.rows[0]?.total_count ?? 0)
  };
};

export const getPromotionTranslationById = async (
  translationId: number
): Promise<PromotionTranslationDto | null> => {
  const result = await db.query<PromotionTranslationRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_instructor_promotion_translations WHERE instr_prom_trans_id = $1 LIMIT 1',
    [translationId]
  );
  const row = result.rows[0];
  return row ? mapPromotionTranslationRow(row) : null;
};

export const createPromotionTranslation = async (
  promotionId: number,
  body: CreatePromotionTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_instructor_promotion_translations', {
    p_promotion_id: promotionId,
    p_language_id: body.languageId,
    p_promotion_name: body.promotionName,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updatePromotionTranslation = async (
  translationId: number,
  body: UpdatePromotionTranslationBody
): Promise<void> => {
  await db.callFunction('udf_update_instructor_promotion_translations', {
    p_translation_id: translationId,
    p_promotion_name: body.promotionName ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_is_active: body.isActive ?? null
  });
};

export const deletePromotionTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_delete_instructor_promotion_translations', {
    p_translation_id: translationId
  });
};

export const restorePromotionTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_restore_instructor_promotion_translations', {
    p_translation_id: translationId
  });
};

// ─── Promotion Course CRUD ────────────────────────────────────────

export const listPromotionCourses = async (
  promotionId: number,
  q: ListPromotionCoursesQuery
): Promise<{ rows: PromotionCourseDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<PromotionCourseRow>(
    'udf_get_instructor_promotion_courses',
    {
      p_id: null,
      p_filter_promotion_id: promotionId,
      p_filter_course_id: q.courseId ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapPromotionCourseRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getPromotionCourseById = async (
  id: number
): Promise<PromotionCourseDto | null> => {
  const { rows } = await db.callTableFunction<PromotionCourseRow>(
    'udf_get_instructor_promotion_courses',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapPromotionCourseRow(row) : null;
};

export const createPromotionCourse = async (
  promotionId: number,
  body: CreatePromotionCourseBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_instructor_promotion_courses', {
    p_promotion_id: promotionId,
    p_course_id: body.courseId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updatePromotionCourse = async (
  id: number,
  body: UpdatePromotionCourseBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_instructor_promotion_courses', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deletePromotionCourse = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_instructor_promotion_courses', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restorePromotionCourse = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_instructor_promotion_courses', {
    p_id: id,
    p_restored_by: callerId
  });
};
