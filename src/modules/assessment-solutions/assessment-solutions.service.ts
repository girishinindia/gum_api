// ═══════════════════════════════════════════════════════════════
// assessment-solutions.service — UDF wrappers for
// /api/v1/assessments/:assessmentId/solutions
//
// Provides CRUD for assessment_solutions +
// assessment_solution_translations.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateAssessmentSolutionBody,
  CreateSolutionTranslationBody,
  ListAssessmentSolutionsQuery,
  ListSolutionTranslationsQuery,
  UpdateAssessmentSolutionBody,
  UpdateSolutionTranslationBody
} from './assessment-solutions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface AssessmentSolutionDto {
  id: number;
  assessmentId: number;
  solutionType: string;
  fileUrl: string | null;
  githubUrl: string | null;
  videoUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  videoDurationSeconds: number | null;
  displayOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Assessment parent info
  assessmentType: string | null;
  assessmentScope: string | null;
  assessmentCode: string | null;
  // Translation context (from joined view)
  translation: SolutionTranslationDto | null;
}

export interface SolutionTranslationDto {
  id: number;
  assessmentSolutionId: number;
  languageId: number;
  title: string;
  description: string | null;
  videoTitle: string | null;
  videoDescription: string | null;
  videoThumbnail: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Language info
  languageName: string | null;
  languageIsoCode: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface SolutionRow {
  asol_id: number | string;
  asol_assessment_id: number | string;
  asol_solution_type: string;
  asol_file_url: string | null;
  asol_github_url: string | null;
  asol_video_url: string | null;
  asol_file_name: string | null;
  asol_file_size_bytes: number | string | null;
  asol_mime_type: string | null;
  asol_video_duration_seconds: number | null;
  asol_display_order: number | string;
  asol_created_by: number | null;
  asol_updated_by: number | null;
  asol_is_active: boolean;
  asol_is_deleted: boolean;
  asol_created_at: Date | string | null;
  asol_updated_at: Date | string | null;
  asol_deleted_at: Date | string | null;
  // Assessment parent
  asol_assessment_type: string | null;
  asol_assessment_scope: string | null;
  asol_assessment_code: string | null;
  asmt_is_deleted: boolean;
  // Translation columns
  asolt_id: number | string | null;
  asolt_assessment_solution_id: number | string | null;
  asolt_language_id: number | string | null;
  asolt_title: string | null;
  asolt_description: string | null;
  asolt_video_title: string | null;
  asolt_video_description: string | null;
  asolt_video_thumbnail: string | null;
  asolt_is_active: boolean | null;
  asolt_is_deleted: boolean | null;
  asolt_created_at: Date | string | null;
  asolt_updated_at: Date | string | null;
  asolt_deleted_at: Date | string | null;
  // Language
  language_id: number | string | null;
  language_name: string | null;
  language_iso_code: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapTranslation = (row: SolutionRow): SolutionTranslationDto | null => {
  if (row.asolt_id == null) return null;
  return {
    id: Number(row.asolt_id),
    assessmentSolutionId: Number(row.asolt_assessment_solution_id),
    languageId: Number(row.asolt_language_id),
    title: row.asolt_title ?? '',
    description: row.asolt_description,
    videoTitle: row.asolt_video_title,
    videoDescription: row.asolt_video_description,
    videoThumbnail: row.asolt_video_thumbnail,
    isActive: row.asolt_is_active ?? true,
    isDeleted: row.asolt_is_deleted ?? false,
    createdAt: toIsoString(row.asolt_created_at),
    updatedAt: toIsoString(row.asolt_updated_at),
    deletedAt: toIsoString(row.asolt_deleted_at),
    languageName: row.language_name,
    languageIsoCode: row.language_iso_code
  };
};

const mapRow = (row: SolutionRow): AssessmentSolutionDto => ({
  id: Number(row.asol_id),
  assessmentId: Number(row.asol_assessment_id),
  solutionType: row.asol_solution_type,
  fileUrl: row.asol_file_url,
  githubUrl: row.asol_github_url,
  videoUrl: row.asol_video_url,
  fileName: row.asol_file_name,
  fileSizeBytes: row.asol_file_size_bytes != null ? Number(row.asol_file_size_bytes) : null,
  mimeType: row.asol_mime_type,
  videoDurationSeconds: row.asol_video_duration_seconds,
  displayOrder: Number(row.asol_display_order),
  createdBy: row.asol_created_by,
  updatedBy: row.asol_updated_by,
  isActive: row.asol_is_active,
  isDeleted: row.asol_is_deleted,
  createdAt: toIsoString(row.asol_created_at),
  updatedAt: toIsoString(row.asol_updated_at),
  deletedAt: toIsoString(row.asol_deleted_at),
  assessmentType: row.asol_assessment_type,
  assessmentScope: row.asol_assessment_scope,
  assessmentCode: row.asol_assessment_code,
  translation: mapTranslation(row)
});

// ─── Solution CRUD ──────────────────────────────────────────────

export interface ListResult {
  rows: AssessmentSolutionDto[];
  meta: PaginationMeta;
}

export const listAssessmentSolutions = async (
  assessmentId: number,
  q: ListAssessmentSolutionsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<SolutionRow>(
    'udf_get_assessment_solutions',
    {
      p_id: null,
      p_assessment_id: assessmentId,
      p_language_id: q.languageId ?? null,
      p_filter_solution_type: q.solutionType ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
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

export const getSolutionById = async (
  id: number
): Promise<AssessmentSolutionDto | null> => {
  const { rows } = await db.callTableFunction<SolutionRow>(
    'udf_get_assessment_solutions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createSolution = async (
  assessmentId: number,
  body: CreateAssessmentSolutionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_assessment_solutions', {
    p_assessment_id: assessmentId,
    p_solution_type: body.solutionType,
    p_file_url: body.fileUrl ?? null,
    p_github_url: body.githubUrl ?? null,
    p_video_url: body.videoUrl ?? null,
    p_file_name: body.fileName ?? null,
    p_file_size_bytes: body.fileSizeBytes ?? null,
    p_mime_type: body.mimeType ?? null,
    p_video_duration_seconds: body.videoDurationSeconds ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateSolution = async (
  id: number,
  body: UpdateAssessmentSolutionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_assessment_solutions', {
    p_id: id,
    p_solution_type: body.solutionType ?? null,
    p_file_url: body.fileUrl !== undefined ? (body.fileUrl ?? '') : null,
    p_github_url: body.githubUrl !== undefined ? (body.githubUrl ?? '') : null,
    p_video_url: body.videoUrl !== undefined ? (body.videoUrl ?? '') : null,
    p_file_name: body.fileName !== undefined ? (body.fileName ?? '') : null,
    p_file_size_bytes: body.fileSizeBytes ?? null,
    p_mime_type: body.mimeType !== undefined ? (body.mimeType ?? '') : null,
    p_video_duration_seconds: body.videoDurationSeconds ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteSolution = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_assessment_solutions', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreSolution = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_assessment_solutions', {
    p_id: id,
    p_restore_children: true,
    p_restored_by: callerId
  });
};

// ─── Solution Translation CRUD ─────────────────────────────────

export interface ListTranslationsResult {
  rows: AssessmentSolutionDto[];
  meta: PaginationMeta;
}

export const listSolutionTranslations = async (
  solutionId: number,
  q: ListSolutionTranslationsQuery
): Promise<ListTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<SolutionRow>(
    'udf_get_assessment_solutions',
    {
      p_id: solutionId,
      p_assessment_id: null,
      p_language_id: q.languageId ?? null,
      p_filter_solution_type: null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
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

export const getSolutionTranslationById = async (
  id: number
): Promise<AssessmentSolutionDto | null> => {
  const result = await db.query<SolutionRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_assessment_solution_translations WHERE asolt_id = $1 LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
};

export const createSolutionTranslation = async (
  solutionId: number,
  body: CreateSolutionTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_assessment_solution_translations', {
    p_assessment_solution_id: solutionId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_video_title: body.videoTitle ?? null,
    p_video_description: body.videoDescription ?? null,
    p_video_thumbnail: body.videoThumbnail ?? null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateSolutionTranslation = async (
  id: number,
  body: UpdateSolutionTranslationBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_assessment_solution_translations', {
    p_id: id,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_video_title: body.videoTitle !== undefined ? (body.videoTitle ?? '') : null,
    p_video_description: body.videoDescription !== undefined ? (body.videoDescription ?? '') : null,
    p_video_thumbnail: body.videoThumbnail !== undefined ? (body.videoThumbnail ?? '') : null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteSolutionTranslation = async (
  id: number,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_assessment_solution_translations', { p_id: id });
};

export const restoreSolutionTranslation = async (
  id: number,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_assessment_solution_translations', { p_id: id });
};
