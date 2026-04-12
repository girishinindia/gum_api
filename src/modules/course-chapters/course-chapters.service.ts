// ═══════════════════════════════════════════════════════════════
// course-chapters.service — UDF wrappers for /api/v1/course-chapters
//
// Provides CRUD operations for course-chapter junction mappings
// using udf_get_course_chapters (limit/offset) and CRUD UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseChapterBody,
  ListCourseChaptersQuery,
  UpdateCourseChapterBody
} from './course-chapters.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseChapterDto {
  id: number;
  courseSubjectId: number;
  chapterId: number;
  displayOrder: number;
  isFreeTrial: boolean;
  note: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  // Joined context
  courseId: number;
  moduleId: number;
  subjectId: number;
  chapterSlug: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface CourseChapterRow {
  cc_id: number | string;
  cc_course_subject_id: number | string;
  cc_chapter_id: number | string;
  cc_display_order: number | string;
  cc_is_free_trial: boolean;
  cc_created_by: number | null;
  cc_updated_by: number | null;
  cc_is_active: boolean;
  cc_is_deleted: boolean;
  cc_created_at: Date | string | null;
  cc_updated_at: Date | string | null;
  cc_deleted_at: Date | string | null;
  cc_note: string | null;
  course_id: number | string;
  module_id: number | string;
  subject_id: number | string;
  chapter_id: number | string;
  chapter_slug: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: CourseChapterRow): CourseChapterDto => ({
  id: Number(row.cc_id),
  courseSubjectId: Number(row.cc_course_subject_id),
  chapterId: Number(row.cc_chapter_id),
  displayOrder: Number(row.cc_display_order),
  isFreeTrial: row.cc_is_free_trial,
  note: row.cc_note,
  isActive: row.cc_is_active,
  createdAt: toIsoString(row.cc_created_at),
  updatedAt: toIsoString(row.cc_updated_at),
  courseId: Number(row.course_id),
  moduleId: Number(row.module_id),
  subjectId: Number(row.subject_id),
  chapterSlug: row.chapter_slug
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: CourseChapterDto[];
  meta: PaginationMeta;
}

export const listCourseChapters = async (
  q: ListCourseChaptersQuery
): Promise<ListResult> => {
  const limit = q.pageSize;
  const offset = q.pageIndex * q.pageSize;

  const { rows, totalCount } = await db.callTableFunction<CourseChapterRow>(
    'udf_get_course_chapters',
    {
      p_id: null,
      p_filter_course_subject_id: q.courseSubjectId ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search: q.searchTerm ?? null,
      p_sort_table: 'cc',
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

export const getCourseChapterById = async (
  id: number
): Promise<CourseChapterDto | null> => {
  const { rows } = await db.callTableFunction<CourseChapterRow>(
    'udf_get_course_chapters',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createCourseChapter = async (
  body: CreateCourseChapterBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_chapters', {
    p_course_subject_id: body.courseSubjectId,
    p_chapter_id: body.chapterId,
    p_display_order: body.displayOrder ?? null,
    p_is_free_trial: body.isFreeTrial ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseChapter = async (
  id: number,
  body: UpdateCourseChapterBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_chapters', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_free_trial: body.isFreeTrial ?? null,
    p_note: body.note !== undefined ? body.note : null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourseChapter = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_course_chapters', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreCourseChapter = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_course_chapters', {
    p_id: id,
    p_actor_id: callerId
  });
};
