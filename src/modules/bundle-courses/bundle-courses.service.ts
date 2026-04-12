// ═══════════════════════════════════════════════════════════════
// bundle-courses.service — UDF wrappers for /api/v1/bundle-courses
//
// Provides CRUD operations for bundle-course junction mappings.
// GET function uses 1-based p_page_index / p_page_size.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateBundleCourseBody,
  ListBundleCoursesQuery,
  UpdateBundleCourseBody
} from './bundle-courses.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface BundleCourseDto {
  id: number;
  bundleId: number;
  courseId: number;
  bundleCode: string | null;
  bundleSlug: string | null;
  bundlePrice: number;
  courseCode: string | null;
  courseSlug: string | null;
  coursePrice: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface BundleCourseRow {
  bc_id: number | string;
  bundle_id: number | string;
  course_id: number | string;
  bundle_code: string | null;
  bundle_slug: string | null;
  bundle_price: number | string;
  course_code: string | null;
  course_slug: string | null;
  course_price: number | string;
  bc_display_order: number | string;
  bc_is_active: boolean;
  bc_created_at: Date | string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: BundleCourseRow): BundleCourseDto => ({
  id: Number(row.bc_id),
  bundleId: Number(row.bundle_id),
  courseId: Number(row.course_id),
  bundleCode: row.bundle_code,
  bundleSlug: row.bundle_slug,
  bundlePrice: Number(row.bundle_price),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  coursePrice: Number(row.course_price),
  displayOrder: Number(row.bc_display_order),
  isActive: row.bc_is_active,
  createdAt: toIsoString(row.bc_created_at)
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: BundleCourseDto[];
  meta: PaginationMeta;
}

export const listBundleCourses = async (
  q: ListBundleCoursesQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<BundleCourseRow>(
    'udf_get_bundle_courses',
    {
      p_id: null,
      p_bundle_id: q.bundleId ?? null,
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
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex - 1, q.pageSize, totalCount)
  };
};

export const getBundleCourseById = async (
  id: number
): Promise<BundleCourseDto | null> => {
  const { rows } = await db.callTableFunction<BundleCourseRow>(
    'udf_get_bundle_courses',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createBundleCourse = async (
  body: CreateBundleCourseBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_bundle_courses', {
    p_bundle_id: body.bundleId,
    p_course_id: body.courseId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateBundleCourse = async (
  id: number,
  body: UpdateBundleCourseBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_bundle_courses', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteBundleCourse = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_bundle_courses', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreBundleCourse = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_bundle_courses', {
    p_id: id,
    p_actor_id: callerId
  });
};
