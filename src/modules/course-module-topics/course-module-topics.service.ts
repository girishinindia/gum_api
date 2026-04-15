// ═══════════════════════════════════════════════════════════════
// course-module-topics.service — UDF wrappers for /api/v1/course-module-topics
//
// Provides CRUD operations for course-module-topic junction mappings.
// GET function uses 1-based p_page_index / p_page_size (not limit/offset).
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseModuleTopicBody,
  ListCourseModuleTopicsQuery,
  UpdateCourseModuleTopicBody
} from './course-module-topics.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseModuleTopicDto {
  id: number;
  courseModuleId: number;
  topicId: number | null;
  courseCode: string | null;
  courseSlug: string | null;
  courseModuleSlug: string | null;
  customTitle: string | null;
  topicSlug: string | null;
  displayOrder: number;
  estimatedMinutes: number | null;
  isPreview: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface CourseModuleTopicRow {
  cmt_id: number | string;
  course_module_id: number | string;
  topic_id: number | string | null;
  course_code: string | null;
  course_slug: string | null;
  course_module_slug: string | null;
  custom_title: string | null;
  topic_slug: string | null;
  cmt_display_order: number | string;
  estimated_minutes: number | null;
  cmt_is_preview: boolean;
  cmt_is_active: boolean;
  cmt_created_at: Date | string | null;
  cmt_updated_at: Date | string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: CourseModuleTopicRow): CourseModuleTopicDto => ({
  id: Number(row.cmt_id),
  courseModuleId: Number(row.course_module_id),
  topicId: row.topic_id != null ? Number(row.topic_id) : null,
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  courseModuleSlug: row.course_module_slug,
  customTitle: row.custom_title,
  topicSlug: row.topic_slug,
  displayOrder: Number(row.cmt_display_order),
  estimatedMinutes: row.estimated_minutes != null ? Number(row.estimated_minutes) : null,
  isPreview: row.cmt_is_preview,
  isActive: row.cmt_is_active,
  createdAt: toIsoString(row.cmt_created_at),
  updatedAt: toIsoString(row.cmt_updated_at)
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: CourseModuleTopicDto[];
  meta: PaginationMeta;
}

export const listCourseModuleTopics = async (
  q: ListCourseModuleTopicsQuery
): Promise<ListResult> => {
  // This get function uses 1-based p_page_index / p_page_size directly
  const { rows, totalCount } = await db.callTableFunction<CourseModuleTopicRow>(
    'udf_get_course_module_topics',
    {
      p_id: null,
      p_course_module_id: q.courseModuleId ?? null,
      p_topic_id: q.topicId ?? null,
      p_is_active: null,
      p_filter_course_module_id: null,
      p_filter_is_preview: q.isPreview ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_filter_has_topic: q.hasTopic ?? null,
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

export const getCourseModuleTopicById = async (
  id: number
): Promise<CourseModuleTopicDto | null> => {
  const { rows } = await db.callTableFunction<CourseModuleTopicRow>(
    'udf_get_course_module_topics',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createCourseModuleTopic = async (
  body: CreateCourseModuleTopicBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_module_topics', {
    p_course_module_id: body.courseModuleId,
    p_topic_id: body.topicId ?? null,
    p_display_order: body.displayOrder ?? null,
    p_custom_title: body.customTitle ?? null,
    p_custom_description: body.customDescription ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_is_preview: body.isPreview ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseModuleTopic = async (
  id: number,
  body: UpdateCourseModuleTopicBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_module_topics', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_custom_title: body.customTitle !== undefined ? body.customTitle : null,
    p_custom_description: body.customDescription !== undefined ? body.customDescription : null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_is_preview: body.isPreview ?? null,
    p_note: body.note !== undefined ? body.note : null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourseModuleTopic = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_course_module_topics', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreCourseModuleTopic = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_course_module_topics', {
    p_id: id,
    p_actor_id: callerId
  });
};
