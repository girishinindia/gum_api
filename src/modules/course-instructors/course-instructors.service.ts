// ═══════════════════════════════════════════════════════════════
// course-instructors.service — UDF wrappers for /api/v1/course-instructors
//
// Provides CRUD operations for course-instructor junction mappings
// using udf_get_course_instructors (limit/offset) and CRUD UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseInstructorBody,
  ListCourseInstructorsQuery,
  UpdateCourseInstructorBody
} from './course-instructors.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseInstructorDto {
  id: number;
  courseId: number;
  instructorId: number;
  instructorRole: string;
  contribution: string | null;
  revenueSharePct: number | null;
  joinDate: string | null;
  leaveDate: string | null;
  displayOrder: number;
  isVisible: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  // Joined context
  courseCode: string | null;
  courseSlug: string | null;
  courseIsActive: boolean;
  instructorFirstName: string | null;
  instructorLastName: string | null;
  instructorEmail: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface CourseInstructorRow {
  ci_id: number | string;
  ci_course_id: number | string;
  ci_instructor_id: number | string;
  ci_instructor_role: string;
  ci_contribution: string | null;
  ci_revenue_share_pct: string | number | null;
  ci_join_date: string | null;
  ci_leave_date: string | null;
  ci_display_order: number | string;
  ci_is_visible: boolean;
  ci_created_by: number | null;
  ci_updated_by: number | null;
  ci_is_active: boolean;
  ci_is_deleted: boolean;
  ci_created_at: Date | string | null;
  ci_updated_at: Date | string | null;
  ci_deleted_at: Date | string | null;
  course_id: number | string;
  course_code: string | null;
  course_slug: string | null;
  course_is_active: boolean;
  instructor_id: number | string;
  instructor_first_name: string | null;
  instructor_last_name: string | null;
  instructor_email: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: CourseInstructorRow): CourseInstructorDto => ({
  id: Number(row.ci_id),
  courseId: Number(row.ci_course_id),
  instructorId: Number(row.ci_instructor_id),
  instructorRole: row.ci_instructor_role,
  contribution: row.ci_contribution,
  revenueSharePct: row.ci_revenue_share_pct != null ? Number(row.ci_revenue_share_pct) : null,
  joinDate: row.ci_join_date,
  leaveDate: row.ci_leave_date,
  displayOrder: Number(row.ci_display_order),
  isVisible: row.ci_is_visible,
  isActive: row.ci_is_active,
  createdAt: toIsoString(row.ci_created_at),
  updatedAt: toIsoString(row.ci_updated_at),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  courseIsActive: row.course_is_active,
  instructorFirstName: row.instructor_first_name,
  instructorLastName: row.instructor_last_name,
  instructorEmail: row.instructor_email
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: CourseInstructorDto[];
  meta: PaginationMeta;
}

export const listCourseInstructors = async (
  q: ListCourseInstructorsQuery
): Promise<ListResult> => {
  const limit = q.pageSize;
  const offset = q.pageIndex * q.pageSize;

  const { rows, totalCount } = await db.callTableFunction<CourseInstructorRow>(
    'udf_get_course_instructors',
    {
      p_id: null,
      p_filter_course_id: q.courseId ?? null,
      p_filter_instructor_role: q.instructorRole ?? null,
      p_filter_is_visible: q.isVisible ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_is_active: q.isActive ?? null,
      p_search: q.searchTerm ?? null,
      p_sort_table: 'ci',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: limit,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCourseInstructorById = async (
  id: number
): Promise<CourseInstructorDto | null> => {
  const { rows } = await db.callTableFunction<CourseInstructorRow>(
    'udf_get_course_instructors',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createCourseInstructor = async (
  body: CreateCourseInstructorBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_instructors', {
    p_course_id: body.courseId,
    p_instructor_id: body.instructorId,
    p_instructor_role: body.instructorRole ?? null,
    p_contribution: body.contribution ?? null,
    p_revenue_share_pct: body.revenueSharePct ?? null,
    p_join_date: body.joinDate ?? null,
    p_leave_date: body.leaveDate ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_visible: body.isVisible ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseInstructor = async (
  id: number,
  body: UpdateCourseInstructorBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_instructors', {
    p_id: id,
    p_instructor_role: body.instructorRole ?? null,
    p_contribution: body.contribution !== undefined ? body.contribution : null,
    p_revenue_share_pct: body.revenueSharePct ?? null,
    p_join_date: body.joinDate ?? null,
    p_leave_date: body.leaveDate ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_visible: body.isVisible ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourseInstructor = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_course_instructors', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreCourseInstructor = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_course_instructors', {
    p_id: id,
    p_actor_id: callerId
  });
};
