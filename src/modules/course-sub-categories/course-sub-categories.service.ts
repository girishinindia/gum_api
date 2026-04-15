// ═══════════════════════════════════════════════════════════════
// course-sub-categories.service — UDF wrappers for /api/v1/course-sub-categories
//
// Provides CRUD operations for course-sub-category junction mappings
// using udf_get_course_sub_categories and CRUD UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseSubCategoryBody,
  ListCourseSubCategoriesQuery,
  UpdateCourseSubCategoryBody
} from './course-sub-categories.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseSubCategoryDto {
  id: number;
  courseId: number;
  subCategoryId: number;
  isPrimary: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  // Joined context
  courseCode: string | null;
  courseSlug: string | null;
  courseIsActive: boolean;
  subCategoryCode: string | null;
  subCategorySlug: string | null;
  subCategoryIsActive: boolean;
}

// ─── Internal Row Interface ────────────────────────────────────

interface CourseSubCategoryRow {
  csc_id: number | string;
  csc_course_id: number | string;
  csc_sub_category_id: number | string;
  csc_is_primary: boolean;
  csc_display_order: number | string;
  csc_created_by: number | null;
  csc_updated_by: number | null;
  csc_is_active: boolean;
  csc_created_at: Date | string | null;
  csc_updated_at: Date | string | null;
  course_id: number | string;
  course_code: string | null;
  course_slug: string | null;
  course_is_active: boolean;
  sub_category_id: number | string;
  sub_category_code: string | null;
  sub_category_slug: string | null;
  sub_category_is_active: boolean;
  total_records?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: CourseSubCategoryRow): CourseSubCategoryDto => ({
  id: Number(row.csc_id),
  courseId: Number(row.csc_course_id),
  subCategoryId: Number(row.csc_sub_category_id),
  isPrimary: row.csc_is_primary,
  displayOrder: Number(row.csc_display_order),
  isActive: row.csc_is_active,
  createdAt: toIsoString(row.csc_created_at),
  updatedAt: toIsoString(row.csc_updated_at),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  courseIsActive: row.course_is_active,
  subCategoryCode: row.sub_category_code,
  subCategorySlug: row.sub_category_slug,
  subCategoryIsActive: row.sub_category_is_active
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: CourseSubCategoryDto[];
  meta: PaginationMeta;
}

export const listCourseSubCategories = async (
  q: ListCourseSubCategoriesQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<CourseSubCategoryRow>(
    'udf_get_course_sub_categories',
    {
      p_id: null,
      p_course_id: q.courseId ?? null,
      p_sub_category_id: q.subCategoryId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_is_primary: q.isPrimary ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search: q.searchTerm ?? null,
      p_sort_table: 'csc',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCourseSubCategoryById = async (
  id: number
): Promise<CourseSubCategoryDto | null> => {
  const { rows } = await db.callTableFunction<CourseSubCategoryRow>(
    'udf_get_course_sub_categories',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createCourseSubCategory = async (
  body: CreateCourseSubCategoryBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_sub_categories', {
    p_course_id: body.courseId,
    p_sub_category_id: body.subCategoryId,
    p_is_primary: body.isPrimary ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseSubCategory = async (
  id: number,
  body: UpdateCourseSubCategoryBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_sub_categories', {
    p_id: id,
    p_is_primary: body.isPrimary ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourseSubCategory = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_course_sub_categories', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreCourseSubCategory = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_course_sub_categories', {
    p_id: id,
    p_actor_id: callerId
  });
};
