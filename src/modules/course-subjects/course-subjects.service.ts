// ═══════════════════════════════════════════════════════════════
// course-subjects.service — UDF wrappers for /api/v1/course-subjects
//
// Provides CRUD operations for course-subject junction mappings
// using udf_get_course_subjects (limit/offset) and CRUD UDFs.
//
// NOTE: udf_get_course_subjects uses p_limit/p_offset instead of
// p_page_index/p_page_size, so this service converts accordingly.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseSubjectBody,
  ListCourseSubjectsQuery,
  UpdateCourseSubjectBody
} from './course-subjects.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseSubjectDto {
  id: number;
  courseId: number;
  moduleId: number;
  subjectId: number;
  displayOrder: number;
  note: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  // Joined context
  courseCode: string | null;
  courseSlug: string | null;
  moduleSlug: string | null;
  subjectCode: string | null;
  subjectSlug: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface CourseSubjectRow {
  cs_id: number | string;
  cs_course_id: number | string;
  cs_module_id: number | string;
  cs_subject_id: number | string;
  cs_display_order: number | string;
  cs_created_by: number | null;
  cs_updated_by: number | null;
  cs_is_active: boolean;
  cs_is_deleted: boolean;
  cs_created_at: Date | string | null;
  cs_updated_at: Date | string | null;
  cs_deleted_at: Date | string | null;
  cs_note: string | null;
  course_id: number | string;
  course_code: string | null;
  course_slug: string | null;
  module_id: number | string;
  module_slug: string | null;
  subject_id: number | string;
  subject_code: string | null;
  subject_slug: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: CourseSubjectRow): CourseSubjectDto => ({
  id: Number(row.cs_id),
  courseId: Number(row.cs_course_id),
  moduleId: Number(row.cs_module_id),
  subjectId: Number(row.cs_subject_id),
  displayOrder: Number(row.cs_display_order),
  note: row.cs_note,
  isActive: row.cs_is_active,
  createdAt: toIsoString(row.cs_created_at),
  updatedAt: toIsoString(row.cs_updated_at),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  moduleSlug: row.module_slug,
  subjectCode: row.subject_code,
  subjectSlug: row.subject_slug
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: CourseSubjectDto[];
  meta: PaginationMeta;
}

export const listCourseSubjects = async (
  q: ListCourseSubjectsQuery
): Promise<ListResult> => {
  // Convert page_index/page_size → limit/offset
  const limit = q.pageSize;
  const offset = q.pageIndex * q.pageSize;

  const { rows, totalCount } = await db.callTableFunction<CourseSubjectRow>(
    'udf_get_course_subjects',
    {
      p_id: null,
      p_filter_course_id: q.courseId ?? null,
      p_filter_module_id: q.moduleId ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search: q.searchTerm ?? null,
      p_sort_table: 'cs',
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

export const getCourseSubjectById = async (
  id: number
): Promise<CourseSubjectDto | null> => {
  const { rows } = await db.callTableFunction<CourseSubjectRow>(
    'udf_get_course_subjects',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createCourseSubject = async (
  body: CreateCourseSubjectBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_subjects', {
    p_course_id: body.courseId,
    p_module_id: body.moduleId,
    p_subject_id: body.subjectId,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseSubject = async (
  id: number,
  body: UpdateCourseSubjectBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_subjects', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note !== undefined ? body.note : null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourseSubject = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_course_subjects', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreCourseSubject = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_course_subjects', {
    p_id: id,
    p_actor_id: callerId
  });
};
