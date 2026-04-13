// ═══════════════════════════════════════════════════════════════
// course-batches.service — UDF wrappers for /api/v1/course-batches
//
// Provides CRUD for course batches + batch translations +
// batch sessions + batch session translations.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseBatchBody,
  CreateBatchTranslationBody,
  CreateBatchSessionBody,
  CreateBatchSessionTranslationBody,
  ListCourseBatchesQuery,
  ListBatchTranslationsQuery,
  ListBatchSessionsQuery,
  ListBatchSessionTranslationsQuery,
  UpdateCourseBatchBody,
  UpdateBatchTranslationBody,
  UpdateBatchSessionBody,
  UpdateBatchSessionTranslationBody
} from './course-batches.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseBatchDto {
  id: number;
  courseId: number;
  batchOwner: string;
  instructorId: number | null;
  instructorFirstName: string | null;
  instructorLastName: string | null;
  instructorEmail: string | null;
  code: string | null;
  isFree: boolean;
  price: number;
  includesCourseAccess: boolean;
  maxStudents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  schedule: unknown;
  meetingPlatform: string | null;
  batchStatus: string;
  displayOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BatchTranslationDto {
  id: number;
  batchId: number;
  languageId: number;
  title: string;
  description: string | null;
  shortDescription: string | null;
  tags: unknown;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogSiteName: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogType: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  twitterSite: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  twitterCard: string | null;
  robotsDirective: string | null;
  focusKeyword: string | null;
  structuredData: unknown;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  languageName: string | null;
  languageIsoCode: string | null;
  languageNativeName: string | null;
}

export interface BatchSessionDto {
  id: number;
  batchId: number;
  sessionNumber: number;
  sessionDate: string | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
  meetingUrl: string | null;
  meetingId: string | null;
  recordingUrl: string | null;
  sessionStatus: string;
  displayOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BatchSessionTranslationDto {
  id: number;
  sessionId: number;
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

// ─── Internal Row Interfaces ─────────────────────────────────────

interface CourseBatchRow {
  total_count?: number | string;
  batch_id: number | string;
  batch_course_id: number | string;
  batch_owner: string;
  batch_instructor_id: number | string | null;
  batch_instructor_first_name: string | null;
  batch_instructor_last_name: string | null;
  batch_instructor_email: string | null;
  batch_code: string | null;
  batch_is_free: boolean;
  batch_price: number | string;
  batch_includes_course_access: boolean;
  batch_max_students: number | null;
  batch_starts_at: Date | string | null;
  batch_ends_at: Date | string | null;
  batch_schedule: unknown;
  batch_meeting_platform: string | null;
  batch_batch_status: string;
  batch_display_order: number | string;
  batch_created_by: number | null;
  batch_updated_by: number | null;
  batch_is_deleted: boolean;
  batch_created_at: Date | string | null;
  batch_updated_at: Date | string | null;
}

interface BatchTranslationRow {
  total_count?: number | string;
  batch_trans_id: number | string;
  batch_trans_batch_id: number | string;
  batch_trans_language_id: number | string;
  batch_trans_language_code: string | null;
  batch_trans_language_name: string | null;
  batch_trans_language_native_name: string | null;
  batch_trans_title: string;
  batch_trans_description: string | null;
  batch_trans_short_description: string | null;
  batch_trans_tags: unknown;
  batch_trans_meta_title: string | null;
  batch_trans_meta_description: string | null;
  batch_trans_meta_keywords: string | null;
  batch_trans_canonical_url: string | null;
  batch_trans_og_site_name: string | null;
  batch_trans_og_title: string | null;
  batch_trans_og_description: string | null;
  batch_trans_og_type: string | null;
  batch_trans_og_image: string | null;
  batch_trans_og_url: string | null;
  batch_trans_twitter_site: string | null;
  batch_trans_twitter_title: string | null;
  batch_trans_twitter_description: string | null;
  batch_trans_twitter_image: string | null;
  batch_trans_twitter_card: string | null;
  batch_trans_robots_directive: string | null;
  batch_trans_focus_keyword: string | null;
  batch_trans_structured_data: unknown;
  batch_trans_is_active: boolean;
  batch_trans_is_deleted: boolean;
  batch_trans_created_at: Date | string | null;
  batch_trans_updated_at: Date | string | null;
  batch_trans_deleted_at: Date | string | null;
}

interface BatchSessionRow {
  total_count?: number | string;
  session_id: number | string;
  session_batch_id: number | string;
  session_number: number | string;
  session_date: Date | string | null;
  session_scheduled_at: Date | string | null;
  session_duration_minutes: number | null;
  session_meeting_url: string | null;
  session_meeting_id: string | null;
  session_recording_url: string | null;
  session_session_status: string;
  session_display_order: number | string;
  session_created_by: number | null;
  session_updated_by: number | null;
  session_is_deleted: boolean;
  session_created_at: Date | string | null;
  session_updated_at: Date | string | null;
}

interface BatchSessionTranslationRow {
  total_count?: number | string;
  bst_id: number | string;
  bst_batch_session_id: number | string;
  bst_language_id: number | string;
  bst_language_code: string | null;
  bst_language_name: string | null;
  bst_language_native_name: string | null;
  bst_title: string;
  bst_description: string | null;
  bst_is_active: boolean;
  bst_is_deleted: boolean;
  bst_created_at: Date | string | null;
  bst_updated_at: Date | string | null;
  bst_deleted_at: Date | string | null;
}

// ─── Mappers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapBatchRow = (row: CourseBatchRow): CourseBatchDto => ({
  id: Number(row.batch_id),
  courseId: Number(row.batch_course_id),
  batchOwner: row.batch_owner,
  instructorId: row.batch_instructor_id != null ? Number(row.batch_instructor_id) : null,
  instructorFirstName: row.batch_instructor_first_name,
  instructorLastName: row.batch_instructor_last_name,
  instructorEmail: row.batch_instructor_email,
  code: row.batch_code,
  isFree: row.batch_is_free,
  price: Number(row.batch_price),
  includesCourseAccess: row.batch_includes_course_access,
  maxStudents: row.batch_max_students,
  startsAt: toIso(row.batch_starts_at),
  endsAt: toIso(row.batch_ends_at),
  schedule: row.batch_schedule,
  meetingPlatform: row.batch_meeting_platform,
  batchStatus: row.batch_batch_status,
  displayOrder: Number(row.batch_display_order),
  createdBy: row.batch_created_by,
  updatedBy: row.batch_updated_by,
  isDeleted: row.batch_is_deleted,
  createdAt: toIso(row.batch_created_at),
  updatedAt: toIso(row.batch_updated_at)
});

const mapBatchTranslationRow = (row: BatchTranslationRow): BatchTranslationDto => ({
  id: Number(row.batch_trans_id),
  batchId: Number(row.batch_trans_batch_id),
  languageId: Number(row.batch_trans_language_id),
  title: row.batch_trans_title,
  description: row.batch_trans_description,
  shortDescription: row.batch_trans_short_description,
  tags: row.batch_trans_tags,
  metaTitle: row.batch_trans_meta_title,
  metaDescription: row.batch_trans_meta_description,
  metaKeywords: row.batch_trans_meta_keywords,
  canonicalUrl: row.batch_trans_canonical_url,
  ogSiteName: row.batch_trans_og_site_name,
  ogTitle: row.batch_trans_og_title,
  ogDescription: row.batch_trans_og_description,
  ogType: row.batch_trans_og_type,
  ogImage: row.batch_trans_og_image,
  ogUrl: row.batch_trans_og_url,
  twitterSite: row.batch_trans_twitter_site,
  twitterTitle: row.batch_trans_twitter_title,
  twitterDescription: row.batch_trans_twitter_description,
  twitterImage: row.batch_trans_twitter_image,
  twitterCard: row.batch_trans_twitter_card,
  robotsDirective: row.batch_trans_robots_directive,
  focusKeyword: row.batch_trans_focus_keyword,
  structuredData: row.batch_trans_structured_data,
  isActive: row.batch_trans_is_active,
  isDeleted: row.batch_trans_is_deleted,
  createdAt: toIso(row.batch_trans_created_at),
  updatedAt: toIso(row.batch_trans_updated_at),
  deletedAt: toIso(row.batch_trans_deleted_at),
  languageName: row.batch_trans_language_name,
  languageIsoCode: row.batch_trans_language_code,
  languageNativeName: row.batch_trans_language_native_name
});

const mapBatchSessionRow = (row: BatchSessionRow): BatchSessionDto => ({
  id: Number(row.session_id),
  batchId: Number(row.session_batch_id),
  sessionNumber: Number(row.session_number),
  sessionDate: toIso(row.session_date),
  scheduledAt: toIso(row.session_scheduled_at),
  durationMinutes: row.session_duration_minutes,
  meetingUrl: row.session_meeting_url,
  meetingId: row.session_meeting_id,
  recordingUrl: row.session_recording_url,
  sessionStatus: row.session_session_status,
  displayOrder: Number(row.session_display_order),
  createdBy: row.session_created_by,
  updatedBy: row.session_updated_by,
  isDeleted: row.session_is_deleted,
  createdAt: toIso(row.session_created_at),
  updatedAt: toIso(row.session_updated_at)
});

const mapBatchSessionTranslationRow = (row: BatchSessionTranslationRow): BatchSessionTranslationDto => ({
  id: Number(row.bst_id),
  sessionId: Number(row.bst_batch_session_id),
  languageId: Number(row.bst_language_id),
  title: row.bst_title,
  description: row.bst_description,
  isActive: row.bst_is_active,
  isDeleted: row.bst_is_deleted,
  createdAt: toIso(row.bst_created_at),
  updatedAt: toIso(row.bst_updated_at),
  deletedAt: toIso(row.bst_deleted_at),
  languageName: row.bst_language_name,
  languageIsoCode: row.bst_language_code,
  languageNativeName: row.bst_language_native_name
});

// ─── List Result ─────────────────────────────────────────────────

export interface ListResult {
  rows: unknown[];
  meta: PaginationMeta;
}

// ─── Course Batch CRUD ───────────────────────────────────────────

export const listCourseBatches = async (
  q: ListCourseBatchesQuery
): Promise<{ rows: CourseBatchDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<CourseBatchRow>(
    'udf_get_course_batches',
    {
      p_id: null,
      p_filter_course_id: q.courseId ?? null,
      p_filter_batch_owner: q.batchOwner ?? null,
      p_filter_batch_status: q.batchStatus ?? null,
      p_filter_is_free: q.isFree ?? null,
      p_filter_meeting_platform: q.meetingPlatform ?? null,
      p_filter_instructor_id: q.instructorId ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapBatchRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCourseBatchById = async (
  id: number
): Promise<CourseBatchDto | null> => {
  const { rows } = await db.callTableFunction<CourseBatchRow>(
    'udf_get_course_batches',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapBatchRow(row) : null;
};

export const createCourseBatch = async (
  body: CreateCourseBatchBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_batches', {
    p_course_id: body.courseId,
    p_batch_owner: body.batchOwner ?? null,
    p_instructor_id: body.instructorId ?? null,
    p_code: body.code ?? null,
    p_is_free: body.isFree ?? null,
    p_price: body.price ?? null,
    p_includes_course_access: body.includesCourseAccess ?? null,
    p_max_students: body.maxStudents ?? null,
    p_starts_at: body.startsAt ?? null,
    p_ends_at: body.endsAt ?? null,
    p_schedule: body.schedule != null ? JSON.stringify(body.schedule) : null,
    p_meeting_platform: body.meetingPlatform ?? null,
    p_batch_status: body.batchStatus ?? null,
    p_display_order: body.displayOrder ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseBatch = async (
  id: number,
  body: UpdateCourseBatchBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_batches', {
    p_batch_id: id,
    p_instructor_id: body.instructorId ?? null,
    p_code: body.code !== undefined ? (body.code ?? '') : null,
    p_is_free: body.isFree ?? null,
    p_price: body.price ?? null,
    p_includes_course_access: body.includesCourseAccess ?? null,
    p_max_students: body.maxStudents ?? null,
    p_starts_at: body.startsAt ?? null,
    p_ends_at: body.endsAt ?? null,
    p_schedule: body.schedule != null ? JSON.stringify(body.schedule) : null,
    p_meeting_platform: body.meetingPlatform ?? null,
    p_batch_status: body.batchStatus ?? null,
    p_display_order: body.displayOrder ?? null,
    p_updated_by: callerId
  });
};

export const deleteCourseBatch = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_course_batches', { p_batch_id: id });
};

export const restoreCourseBatch = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_course_batches', { p_batch_id: id });
};

// ─── Batch Translation CRUD ──────────────────────────────────────

export const listBatchTranslations = async (
  batchId: number,
  q: ListBatchTranslationsQuery
): Promise<{ rows: BatchTranslationDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const sortColumnMap: Record<string, string> = {
    id: 'batch_trans_id',
    title: 'batch_trans_title',
    created_at: 'batch_trans_created_at',
    updated_at: 'batch_trans_updated_at'
  };
  const sortColumn = sortColumnMap[q.sortColumn] || 'batch_trans_created_at';

  const result = await db.query<BatchTranslationRow>(
    `
      SELECT *, COUNT(*) OVER()::INT AS total_count
      FROM uv_batch_translations
      WHERE batch_trans_batch_id = $1
      ORDER BY ${sortColumn} ${q.sortDirection}
      LIMIT $2 OFFSET $3
    `,
    [batchId, q.pageSize, offset]
  );

  return {
    rows: result.rows.map(mapBatchTranslationRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, result.rows[0]?.total_count ?? 0)
  };
};

export const getBatchTranslationById = async (
  translationId: number
): Promise<BatchTranslationDto | null> => {
  const result = await db.query<BatchTranslationRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_batch_translations WHERE batch_trans_id = $1 LIMIT 1',
    [translationId]
  );
  const row = result.rows[0];
  return row ? mapBatchTranslationRow(row) : null;
};

export const createBatchTranslation = async (
  batchId: number,
  body: CreateBatchTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_batch_translations', {
    p_batch_id: batchId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_short_description: body.shortDescription ?? null,
    p_tags: body.tags != null ? JSON.stringify(body.tags) : null,
    p_meta_title: body.metaTitle ?? null,
    p_meta_description: body.metaDescription ?? null,
    p_meta_keywords: body.metaKeywords ?? null,
    p_canonical_url: body.canonicalUrl ?? null,
    p_og_site_name: body.ogSiteName ?? null,
    p_og_title: body.ogTitle ?? null,
    p_og_description: body.ogDescription ?? null,
    p_og_type: body.ogType ?? null,
    p_og_image: body.ogImage ?? null,
    p_og_url: body.ogUrl ?? null,
    p_twitter_site: body.twitterSite ?? null,
    p_twitter_title: body.twitterTitle ?? null,
    p_twitter_description: body.twitterDescription ?? null,
    p_twitter_image: body.twitterImage ?? null,
    p_twitter_card: body.twitterCard ?? null,
    p_robots_directive: body.robotsDirective ?? null,
    p_focus_keyword: body.focusKeyword ?? null,
    p_structured_data: body.structuredData != null ? JSON.stringify(body.structuredData) : null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateBatchTranslation = async (
  translationId: number,
  body: UpdateBatchTranslationBody
): Promise<void> => {
  await db.callFunction('udf_update_batch_translations', {
    p_translation_id: translationId,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_short_description: body.shortDescription !== undefined ? (body.shortDescription ?? '') : null,
    p_tags: body.tags != null ? JSON.stringify(body.tags) : null,
    p_meta_title: body.metaTitle !== undefined ? (body.metaTitle ?? '') : null,
    p_meta_description: body.metaDescription !== undefined ? (body.metaDescription ?? '') : null,
    p_meta_keywords: body.metaKeywords !== undefined ? (body.metaKeywords ?? '') : null,
    p_canonical_url: body.canonicalUrl !== undefined ? (body.canonicalUrl ?? '') : null,
    p_og_site_name: body.ogSiteName !== undefined ? (body.ogSiteName ?? '') : null,
    p_og_title: body.ogTitle !== undefined ? (body.ogTitle ?? '') : null,
    p_og_description: body.ogDescription !== undefined ? (body.ogDescription ?? '') : null,
    p_og_type: body.ogType !== undefined ? (body.ogType ?? '') : null,
    p_og_image: body.ogImage !== undefined ? (body.ogImage ?? '') : null,
    p_og_url: body.ogUrl !== undefined ? (body.ogUrl ?? '') : null,
    p_twitter_site: body.twitterSite !== undefined ? (body.twitterSite ?? '') : null,
    p_twitter_title: body.twitterTitle !== undefined ? (body.twitterTitle ?? '') : null,
    p_twitter_description: body.twitterDescription !== undefined ? (body.twitterDescription ?? '') : null,
    p_twitter_image: body.twitterImage !== undefined ? (body.twitterImage ?? '') : null,
    p_twitter_card: body.twitterCard !== undefined ? (body.twitterCard ?? '') : null,
    p_robots_directive: body.robotsDirective !== undefined ? (body.robotsDirective ?? '') : null,
    p_focus_keyword: body.focusKeyword !== undefined ? (body.focusKeyword ?? '') : null,
    p_structured_data: body.structuredData != null ? JSON.stringify(body.structuredData) : null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteBatchTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_delete_batch_translations', {
    p_translation_id: translationId
  });
};

export const restoreBatchTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_restore_batch_translations', {
    p_translation_id: translationId
  });
};

// ─── Batch Session CRUD ──────────────────────────────────────────

export const listBatchSessions = async (
  batchId: number,
  q: ListBatchSessionsQuery
): Promise<{ rows: BatchSessionDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<BatchSessionRow>(
    'udf_get_batch_sessions',
    {
      p_id: null,
      p_filter_batch_id: batchId,
      p_filter_session_status: q.sessionStatus ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapBatchSessionRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getBatchSessionById = async (
  id: number
): Promise<BatchSessionDto | null> => {
  const { rows } = await db.callTableFunction<BatchSessionRow>(
    'udf_get_batch_sessions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapBatchSessionRow(row) : null;
};

export const createBatchSession = async (
  batchId: number,
  body: CreateBatchSessionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_batch_sessions', {
    p_batch_id: batchId,
    p_session_number: body.sessionNumber,
    p_session_date: body.sessionDate,
    p_scheduled_at: body.scheduledAt,
    p_duration_minutes: body.durationMinutes ?? null,
    p_meeting_url: body.meetingUrl ?? null,
    p_meeting_id: body.meetingId ?? null,
    p_recording_url: body.recordingUrl ?? null,
    p_session_status: body.sessionStatus ?? null,
    p_display_order: body.displayOrder ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateBatchSession = async (
  id: number,
  body: UpdateBatchSessionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_batch_sessions', {
    p_session_id: id,
    p_session_date: body.sessionDate ?? null,
    p_scheduled_at: body.scheduledAt ?? null,
    p_duration_minutes: body.durationMinutes ?? null,
    p_meeting_url: body.meetingUrl !== undefined ? (body.meetingUrl ?? '') : null,
    p_meeting_id: body.meetingId !== undefined ? (body.meetingId ?? '') : null,
    p_recording_url: body.recordingUrl !== undefined ? (body.recordingUrl ?? '') : null,
    p_session_status: body.sessionStatus ?? null,
    p_display_order: body.displayOrder ?? null,
    p_updated_by: callerId
  });
};

export const deleteBatchSession = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_batch_sessions', { p_session_id: id });
};

export const restoreBatchSession = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_batch_sessions', { p_session_id: id });
};

// ─── Batch Session Translation CRUD ──────────────────────────────

export const listBatchSessionTranslations = async (
  sessionId: number,
  q: ListBatchSessionTranslationsQuery
): Promise<{ rows: BatchSessionTranslationDto[]; meta: PaginationMeta }> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const sortColumnMap: Record<string, string> = {
    id: 'bst_id',
    title: 'bst_title',
    created_at: 'bst_created_at',
    updated_at: 'bst_updated_at'
  };
  const sortColumn = sortColumnMap[q.sortColumn] || 'bst_created_at';

  const result = await db.query<BatchSessionTranslationRow>(
    `
      SELECT *, COUNT(*) OVER()::INT AS total_count
      FROM uv_batch_session_translations
      WHERE bst_batch_session_id = $1
      ORDER BY ${sortColumn} ${q.sortDirection}
      LIMIT $2 OFFSET $3
    `,
    [sessionId, q.pageSize, offset]
  );

  return {
    rows: result.rows.map(mapBatchSessionTranslationRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, result.rows[0]?.total_count ?? 0)
  };
};

export const getBatchSessionTranslationById = async (
  translationId: number
): Promise<BatchSessionTranslationDto | null> => {
  const result = await db.query<BatchSessionTranslationRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_batch_session_translations WHERE bst_id = $1 LIMIT 1',
    [translationId]
  );
  const row = result.rows[0];
  return row ? mapBatchSessionTranslationRow(row) : null;
};

export const createBatchSessionTranslation = async (
  sessionId: number,
  body: CreateBatchSessionTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_batch_session_translations', {
    p_batch_session_id: sessionId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateBatchSessionTranslation = async (
  translationId: number,
  body: UpdateBatchSessionTranslationBody
): Promise<void> => {
  await db.callFunction('udf_update_batch_session_translations', {
    p_translation_id: translationId,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteBatchSessionTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_delete_batch_session_translations', {
    p_translation_id: translationId
  });
};

export const restoreBatchSessionTranslation = async (translationId: number): Promise<void> => {
  await db.callFunction('udf_restore_batch_session_translations', {
    p_translation_id: translationId
  });
};
