// ═══════════════════════════════════════════════════════════════
// coupons.service — UDF wrappers for /api/v1/coupons
//
// Provides CRUD for coupons + coupon translations + coupon courses +
// coupon bundles + coupon batches + coupon webinars.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCouponBody,
  CreateCouponTranslationBody,
  CreateCouponCourseBody,
  CreateCouponBundleBody,
  CreateCouponBatchBody,
  CreateCouponWebinarBody,
  ListCouponsQuery,
  ListCouponTranslationsQuery,
  ListCouponCoursesQuery,
  ListCouponBundlesQuery,
  ListCouponBatchesQuery,
  ListCouponWebinarsQuery,
  UpdateCouponBody,
  UpdateCouponTranslationBody,
  UpdateCouponCourseBody,
  UpdateCouponBundleBody,
  UpdateCouponBatchBody,
  UpdateCouponWebinarBody
} from './coupons.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CouponDto {
  id: number;
  code: string;
  slug: string;
  discountType: string;
  discountValue: number;
  minPurchaseAmount: number | null;
  maxDiscountAmount: number | null;
  applicableTo: string | null;
  usageLimit: number | null;
  usagePerUser: number;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CouponTranslationDto {
  id: number;
  couponId: number;
  languageId: number;
  title: string;
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

export interface CouponCourseDto {
  id: number;
  couponId: number;
  courseId: number;
  couponCode: string;
  couponSlug: string;
  couponDiscountType: string;
  couponDiscountValue: number;
  courseCode: string | null;
  courseSlug: string | null;
  coursePrice: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
}

export interface CouponBundleDto {
  id: number;
  couponId: number;
  bundleId: number;
  couponCode: string;
  couponSlug: string;
  couponDiscountType: string;
  couponDiscountValue: number;
  bundleCode: string | null;
  bundleSlug: string | null;
  bundlePrice: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
}

export interface CouponBatchDto {
  id: number;
  couponId: number;
  batchId: number;
  couponCode: string;
  couponSlug: string;
  couponDiscountType: string;
  couponDiscountValue: number;
  batchCode: string | null;
  batchSlug: string | null;
  batchStartsAt: string | null;
  batchStatus: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
}

export interface CouponWebinarDto {
  id: number;
  couponId: number;
  webinarId: number;
  couponCode: string;
  couponSlug: string;
  couponDiscountType: string;
  couponDiscountValue: number;
  webinarCode: string | null;
  webinarSlug: string | null;
  webinarPrice: number;
  webinarScheduledAt: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
}

// ─── Internal Row Interfaces ─────────────────────────────────────

interface CouponRow {
  total_count?: number | string;
  coupon_id: number | string;
  coupon_code: string;
  coupon_slug: string;
  coupon_discount_type: string;
  coupon_discount_value: number | string;
  coupon_min_purchase_amount: number | string | null;
  coupon_max_discount_amount: number | string | null;
  coupon_applicable_to: string | null;
  coupon_usage_limit: number | string | null;
  coupon_usage_per_user: number | string;
  coupon_used_count: number | string;
  coupon_valid_from: Date | string | null;
  coupon_valid_until: Date | string | null;
  coupon_is_active: boolean;
  coupon_created_at: Date | string | null;
  coupon_updated_at: Date | string | null;
}

interface CouponTranslationRow {
  total_count?: number | string;
  coup_trans_id: number | string;
  coup_trans_coupon_id: number | string;
  coup_trans_language_id: number | string;
  coup_trans_title: string;
  coup_trans_description: string | null;
  coup_trans_is_active: boolean;
  coup_trans_is_deleted: boolean;
  coup_trans_created_at: Date | string | null;
  coup_trans_updated_at: Date | string | null;
  coup_trans_deleted_at: Date | string | null;
  language_id: number | string;
  language_name: string | null;
  language_iso_code: string | null;
}

interface CouponCourseRow {
  total_count?: number | string;
  cc_id: number | string;
  coupon_id: number | string;
  course_id: number | string;
  coupon_code: string;
  coupon_slug: string;
  coupon_discount_type: string;
  coupon_discount_value: number | string;
  course_code: string | null;
  course_slug: string | null;
  course_price: number | string;
  cc_display_order: number | string;
  cc_is_active: boolean;
  cc_created_at: Date | string | null;
}

interface CouponBundleRow {
  total_count?: number | string;
  cb_id: number | string;
  coupon_id: number | string;
  bundle_id: number | string;
  coupon_code: string;
  coupon_slug: string;
  coupon_discount_type: string;
  coupon_discount_value: number | string;
  bundle_code: string | null;
  bundle_slug: string | null;
  bundle_price: number | string;
  cb_display_order: number | string;
  cb_is_active: boolean;
  cb_created_at: Date | string | null;
}

interface CouponBatchRow {
  total_count?: number | string;
  cbat_id: number | string;
  coupon_id: number | string;
  batch_id: number | string;
  coupon_code: string;
  coupon_slug: string;
  coupon_discount_type: string;
  coupon_discount_value: number | string;
  batch_code: string | null;
  batch_slug: string | null;
  batch_starts_at: Date | string | null;
  batch_status: string;
  cbat_display_order: number | string;
  cbat_is_active: boolean;
  cbat_created_at: Date | string | null;
}

interface CouponWebinarRow {
  total_count?: number | string;
  cw_id: number | string;
  coupon_id: number | string;
  webinar_id: number | string;
  coupon_code: string;
  coupon_slug: string;
  coupon_discount_type: string;
  coupon_discount_value: number | string;
  webinar_code: string | null;
  webinar_slug: string | null;
  webinar_price: number | string;
  webinar_scheduled_at: Date | string | null;
  cw_display_order: number | string;
  cw_is_active: boolean;
  cw_created_at: Date | string | null;
}

// ─── Mappers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapCouponRow = (row: CouponRow): CouponDto => ({
  id: Number(row.coupon_id),
  code: row.coupon_code,
  slug: row.coupon_slug,
  discountType: row.coupon_discount_type,
  discountValue: Number(row.coupon_discount_value),
  minPurchaseAmount: row.coupon_min_purchase_amount != null ? Number(row.coupon_min_purchase_amount) : null,
  maxDiscountAmount: row.coupon_max_discount_amount != null ? Number(row.coupon_max_discount_amount) : null,
  applicableTo: row.coupon_applicable_to,
  usageLimit: row.coupon_usage_limit != null ? Number(row.coupon_usage_limit) : null,
  usagePerUser: Number(row.coupon_usage_per_user),
  usedCount: Number(row.coupon_used_count),
  validFrom: toIso(row.coupon_valid_from),
  validUntil: toIso(row.coupon_valid_until),
  isActive: row.coupon_is_active,
  createdAt: toIso(row.coupon_created_at),
  updatedAt: toIso(row.coupon_updated_at)
});

const mapCouponTranslationRow = (row: CouponTranslationRow): CouponTranslationDto => ({
  id: Number(row.coup_trans_id),
  couponId: Number(row.coup_trans_coupon_id),
  languageId: Number(row.coup_trans_language_id),
  title: row.coup_trans_title,
  description: row.coup_trans_description,
  isActive: row.coup_trans_is_active,
  isDeleted: row.coup_trans_is_deleted,
  createdAt: toIso(row.coup_trans_created_at),
  updatedAt: toIso(row.coup_trans_updated_at),
  deletedAt: toIso(row.coup_trans_deleted_at),
  languageName: row.language_name,
  languageIsoCode: row.language_iso_code,
  languageNativeName: null
});

const mapCouponCourseRow = (row: CouponCourseRow): CouponCourseDto => ({
  id: Number(row.cc_id),
  couponId: Number(row.coupon_id),
  courseId: Number(row.course_id),
  couponCode: row.coupon_code,
  couponSlug: row.coupon_slug,
  couponDiscountType: row.coupon_discount_type,
  couponDiscountValue: Number(row.coupon_discount_value),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  coursePrice: Number(row.course_price),
  displayOrder: Number(row.cc_display_order),
  isActive: row.cc_is_active,
  createdAt: toIso(row.cc_created_at)
});

const mapCouponBundleRow = (row: CouponBundleRow): CouponBundleDto => ({
  id: Number(row.cb_id),
  couponId: Number(row.coupon_id),
  bundleId: Number(row.bundle_id),
  couponCode: row.coupon_code,
  couponSlug: row.coupon_slug,
  couponDiscountType: row.coupon_discount_type,
  couponDiscountValue: Number(row.coupon_discount_value),
  bundleCode: row.bundle_code,
  bundleSlug: row.bundle_slug,
  bundlePrice: Number(row.bundle_price),
  displayOrder: Number(row.cb_display_order),
  isActive: row.cb_is_active,
  createdAt: toIso(row.cb_created_at)
});

const mapCouponBatchRow = (row: CouponBatchRow): CouponBatchDto => ({
  id: Number(row.cbat_id),
  couponId: Number(row.coupon_id),
  batchId: Number(row.batch_id),
  couponCode: row.coupon_code,
  couponSlug: row.coupon_slug,
  couponDiscountType: row.coupon_discount_type,
  couponDiscountValue: Number(row.coupon_discount_value),
  batchCode: row.batch_code,
  batchSlug: row.batch_slug,
  batchStartsAt: toIso(row.batch_starts_at),
  batchStatus: row.batch_status,
  displayOrder: Number(row.cbat_display_order),
  isActive: row.cbat_is_active,
  createdAt: toIso(row.cbat_created_at)
});

const mapCouponWebinarRow = (row: CouponWebinarRow): CouponWebinarDto => ({
  id: Number(row.cw_id),
  couponId: Number(row.coupon_id),
  webinarId: Number(row.webinar_id),
  couponCode: row.coupon_code,
  couponSlug: row.coupon_slug,
  couponDiscountType: row.coupon_discount_type,
  couponDiscountValue: Number(row.coupon_discount_value),
  webinarCode: row.webinar_code,
  webinarSlug: row.webinar_slug,
  webinarPrice: Number(row.webinar_price),
  webinarScheduledAt: toIso(row.webinar_scheduled_at),
  displayOrder: Number(row.cw_display_order),
  isActive: row.cw_is_active,
  createdAt: toIso(row.cw_created_at)
});

// ─── List Result ─────────────────────────────────────────────────

export interface ListResult {
  rows: unknown[];
  meta: PaginationMeta;
}

// ─── Coupon CRUD ────────────────────────────────────────────────

export const listCoupons = async (
  q: ListCouponsQuery
): Promise<{ rows: CouponDto[]; meta: PaginationMeta }> => {
  const { rows, totalCount } = await db.callTableFunction<CouponRow>(
    'udf_get_coupons',
    {
      p_id: null,
      p_code: q.code ?? null,
      p_is_active: q.isActive ?? null,
      p_discount_type: q.discountType ?? null,
      p_applicable_to: q.applicableTo ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCouponRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCouponById = async (id: number): Promise<CouponDto | null> => {
  const { rows } = await db.callTableFunction<CouponRow>(
    'udf_get_coupons',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCouponRow(row) : null;
};

export const createCoupon = async (
  body: CreateCouponBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_coupons', {
    p_code: body.code,
    p_discount_type: body.discountType,
    p_discount_value: body.discountValue,
    p_min_purchase_amount: body.minPurchaseAmount ?? null,
    p_max_discount_amount: body.maxDiscountAmount ?? null,
    p_applicable_to: body.applicableTo ?? null,
    p_usage_limit: body.usageLimit ?? null,
    p_usage_per_user: body.usagePerUser ?? null,
    p_valid_from: body.validFrom ?? null,
    p_valid_until: body.validUntil ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateCoupon = async (
  id: number,
  body: UpdateCouponBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_coupons', {
    p_id: id,
    p_discount_value: body.discountValue ?? null,
    p_min_purchase_amount: body.minPurchaseAmount ?? null,
    p_max_discount_amount: body.maxDiscountAmount ?? null,
    p_usage_limit: body.usageLimit ?? null,
    p_usage_per_user: body.usagePerUser ?? null,
    p_valid_from: body.validFrom ?? null,
    p_valid_until: body.validUntil ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteCoupon = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_coupons', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreCoupon = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_coupons', { p_id: id });
};

// ─── Coupon Translation CRUD ────────────────────────────────────

export const listCouponTranslations = async (
  couponId: number,
  q: ListCouponTranslationsQuery
): Promise<{ rows: CouponTranslationDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const sortColumnMap: Record<string, string> = {
    id: 'coup_trans_id',
    title: 'coup_trans_title',
    created_at: 'coup_trans_created_at',
    updated_at: 'coup_trans_updated_at'
  };
  const sortColumn = sortColumnMap[q.sortColumn] || 'coup_trans_created_at';

  const result = await db.query<CouponTranslationRow>(
    `
      SELECT *, COUNT(*) OVER()::INT AS total_count
      FROM uv_coupon_translations
      WHERE coup_trans_coupon_id = $1
      ORDER BY ${sortColumn} ${q.sortDirection}
      LIMIT $2 OFFSET $3
    `,
    [couponId, q.pageSize, offset]
  );

  return {
    rows: result.rows.map(mapCouponTranslationRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, result.rows[0]?.total_count ?? 0)
  };
};

export const getCouponTranslationById = async (
  translationId: number
): Promise<CouponTranslationDto | null> => {
  const result = await db.query<CouponTranslationRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_coupon_translations WHERE coup_trans_id = $1 LIMIT 1',
    [translationId]
  );
  const row = result.rows[0];
  return row ? mapCouponTranslationRow(row) : null;
};

export const createCouponTranslation = async (
  couponId: number,
  body: CreateCouponTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_coupon_translations', {
    p_coupon_id: couponId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateCouponTranslation = async (
  translationId: number,
  body: UpdateCouponTranslationBody
): Promise<void> => {
  await db.callFunction('udf_update_coupon_translations', {
    p_id: translationId,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteCouponTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_delete_coupon_translations', {
    p_id: translationId
  });
};

export const restoreCouponTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_restore_coupon_translations', {
    p_id: translationId
  });
};

// ─── Coupon Course CRUD ─────────────────────────────────────────

export const listCouponCourses = async (
  couponId: number,
  q: ListCouponCoursesQuery
): Promise<{ rows: CouponCourseDto[]; meta: PaginationMeta }> => {
  const { rows, totalCount } = await db.callTableFunction<CouponCourseRow>(
    'udf_get_coupon_courses',
    {
      p_id: null,
      p_coupon_id: couponId,
      p_course_id: q.courseId ?? null,
      p_is_active: q.isActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCouponCourseRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCouponCourseById = async (id: number): Promise<CouponCourseDto | null> => {
  const { rows } = await db.callTableFunction<CouponCourseRow>(
    'udf_get_coupon_courses',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCouponCourseRow(row) : null;
};

export const createCouponCourse = async (
  couponId: number,
  body: CreateCouponCourseBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_coupon_courses', {
    p_coupon_id: couponId,
    p_course_id: body.courseId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateCouponCourse = async (
  id: number,
  body: UpdateCouponCourseBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_coupon_courses', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteCouponCourse = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_coupon_courses', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreCouponCourse = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_coupon_courses', {
    p_id: id,
    p_restored_by: callerId
  });
};

// ─── Coupon Bundle CRUD ─────────────────────────────────────────

export const listCouponBundles = async (
  couponId: number,
  q: ListCouponBundlesQuery
): Promise<{ rows: CouponBundleDto[]; meta: PaginationMeta }> => {
  const { rows, totalCount } = await db.callTableFunction<CouponBundleRow>(
    'udf_get_coupon_bundles',
    {
      p_id: null,
      p_coupon_id: couponId,
      p_bundle_id: q.bundleId ?? null,
      p_is_active: q.isActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCouponBundleRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCouponBundleById = async (id: number): Promise<CouponBundleDto | null> => {
  const { rows } = await db.callTableFunction<CouponBundleRow>(
    'udf_get_coupon_bundles',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCouponBundleRow(row) : null;
};

export const createCouponBundle = async (
  couponId: number,
  body: CreateCouponBundleBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_coupon_bundles', {
    p_coupon_id: couponId,
    p_bundle_id: body.bundleId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateCouponBundle = async (
  id: number,
  body: UpdateCouponBundleBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_coupon_bundles', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteCouponBundle = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_coupon_bundles', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreCouponBundle = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_coupon_bundles', {
    p_id: id,
    p_restored_by: callerId
  });
};

// ─── Coupon Batch CRUD ──────────────────────────────────────────

export const listCouponBatches = async (
  couponId: number,
  q: ListCouponBatchesQuery
): Promise<{ rows: CouponBatchDto[]; meta: PaginationMeta }> => {
  const { rows, totalCount } = await db.callTableFunction<CouponBatchRow>(
    'udf_get_coupon_batches',
    {
      p_id: null,
      p_coupon_id: couponId,
      p_batch_id: q.batchId ?? null,
      p_is_active: q.isActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCouponBatchRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCouponBatchById = async (id: number): Promise<CouponBatchDto | null> => {
  const { rows } = await db.callTableFunction<CouponBatchRow>(
    'udf_get_coupon_batches',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCouponBatchRow(row) : null;
};

export const createCouponBatch = async (
  couponId: number,
  body: CreateCouponBatchBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_coupon_batches', {
    p_coupon_id: couponId,
    p_batch_id: body.batchId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateCouponBatch = async (
  id: number,
  body: UpdateCouponBatchBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_coupon_batches', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteCouponBatch = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_coupon_batches', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreCouponBatch = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_coupon_batches', {
    p_id: id,
    p_restored_by: callerId
  });
};

// ─── Coupon Webinar CRUD ────────────────────────────────────────

export const listCouponWebinars = async (
  couponId: number,
  q: ListCouponWebinarsQuery
): Promise<{ rows: CouponWebinarDto[]; meta: PaginationMeta }> => {
  const { rows, totalCount } = await db.callTableFunction<CouponWebinarRow>(
    'udf_get_coupon_webinars',
    {
      p_id: null,
      p_coupon_id: couponId,
      p_webinar_id: q.webinarId ?? null,
      p_is_active: q.isActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCouponWebinarRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCouponWebinarById = async (id: number): Promise<CouponWebinarDto | null> => {
  const { rows } = await db.callTableFunction<CouponWebinarRow>(
    'udf_get_coupon_webinars',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCouponWebinarRow(row) : null;
};

export const createCouponWebinar = async (
  couponId: number,
  body: CreateCouponWebinarBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_coupon_webinars', {
    p_coupon_id: couponId,
    p_webinar_id: body.webinarId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateCouponWebinar = async (
  id: number,
  body: UpdateCouponWebinarBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_coupon_webinars', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteCouponWebinar = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_coupon_webinars', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreCouponWebinar = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_coupon_webinars', {
    p_id: id,
    p_restored_by: callerId
  });
};
