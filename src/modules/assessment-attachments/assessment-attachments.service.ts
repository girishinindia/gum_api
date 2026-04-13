// ═══════════════════════════════════════════════════════════════
// assessment-attachments.service — UDF wrappers for
// /api/v1/assessments/:assessmentId/attachments
//
// Provides CRUD for assessment_attachments +
// assessment_attachment_translations.
// Uses udf_get_assessment_attachments (combined view with translations)
// and individual insert/update/delete/restore UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateAssessmentAttachmentBody,
  CreateAttachmentTranslationBody,
  ListAssessmentAttachmentsQuery,
  ListAttachmentTranslationsQuery,
  UpdateAssessmentAttachmentBody,
  UpdateAttachmentTranslationBody
} from './assessment-attachments.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface AssessmentAttachmentDto {
  id: number;
  assessmentId: number;
  attachmentType: string;
  fileUrl: string | null;
  githubUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
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
  translation: AttachmentTranslationDto | null;
}

export interface AttachmentTranslationDto {
  id: number;
  assessmentAttachmentId: number;
  languageId: number;
  title: string;
  description: string | null;
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

interface AttachmentRow {
  aa_id: number | string;
  aa_assessment_id: number | string;
  aa_attachment_type: string;
  aa_file_url: string | null;
  aa_github_url: string | null;
  aa_file_name: string | null;
  aa_file_size_bytes: number | string | null;
  aa_mime_type: string | null;
  aa_display_order: number | string;
  aa_created_by: number | null;
  aa_updated_by: number | null;
  aa_is_active: boolean;
  aa_is_deleted: boolean;
  aa_created_at: Date | string | null;
  aa_updated_at: Date | string | null;
  aa_deleted_at: Date | string | null;
  // Assessment parent
  aa_assessment_type: string | null;
  aa_assessment_scope: string | null;
  aa_assessment_code: string | null;
  asmt_is_deleted: boolean;
  // Translation columns
  aat_id: number | string | null;
  aat_assessment_attachment_id: number | string | null;
  aat_language_id: number | string | null;
  aat_title: string | null;
  aat_description: string | null;
  aat_is_active: boolean | null;
  aat_is_deleted: boolean | null;
  aat_created_at: Date | string | null;
  aat_updated_at: Date | string | null;
  aat_deleted_at: Date | string | null;
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

const mapTranslation = (row: AttachmentRow): AttachmentTranslationDto | null => {
  if (row.aat_id == null) return null;
  return {
    id: Number(row.aat_id),
    assessmentAttachmentId: Number(row.aat_assessment_attachment_id),
    languageId: Number(row.aat_language_id),
    title: row.aat_title ?? '',
    description: row.aat_description,
    isActive: row.aat_is_active ?? true,
    isDeleted: row.aat_is_deleted ?? false,
    createdAt: toIsoString(row.aat_created_at),
    updatedAt: toIsoString(row.aat_updated_at),
    deletedAt: toIsoString(row.aat_deleted_at),
    languageName: row.language_name,
    languageIsoCode: row.language_iso_code
  };
};

const mapRow = (row: AttachmentRow): AssessmentAttachmentDto => ({
  id: Number(row.aa_id),
  assessmentId: Number(row.aa_assessment_id),
  attachmentType: row.aa_attachment_type,
  fileUrl: row.aa_file_url,
  githubUrl: row.aa_github_url,
  fileName: row.aa_file_name,
  fileSizeBytes: row.aa_file_size_bytes != null ? Number(row.aa_file_size_bytes) : null,
  mimeType: row.aa_mime_type,
  displayOrder: Number(row.aa_display_order),
  createdBy: row.aa_created_by,
  updatedBy: row.aa_updated_by,
  isActive: row.aa_is_active,
  isDeleted: row.aa_is_deleted,
  createdAt: toIsoString(row.aa_created_at),
  updatedAt: toIsoString(row.aa_updated_at),
  deletedAt: toIsoString(row.aa_deleted_at),
  assessmentType: row.aa_assessment_type,
  assessmentScope: row.aa_assessment_scope,
  assessmentCode: row.aa_assessment_code,
  translation: mapTranslation(row)
});

// ─── Attachment CRUD ──────────────────────────────────────────

export interface ListResult {
  rows: AssessmentAttachmentDto[];
  meta: PaginationMeta;
}

export const listAssessmentAttachments = async (
  assessmentId: number,
  q: ListAssessmentAttachmentsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<AttachmentRow>(
    'udf_get_assessment_attachments',
    {
      p_id: null,
      p_assessment_id: assessmentId,
      p_language_id: q.languageId ?? null,
      p_filter_attachment_type: q.attachmentType ?? null,
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

export const getAttachmentById = async (
  id: number
): Promise<AssessmentAttachmentDto | null> => {
  const { rows } = await db.callTableFunction<AttachmentRow>(
    'udf_get_assessment_attachments',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createAttachment = async (
  assessmentId: number,
  body: CreateAssessmentAttachmentBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_assessment_attachments', {
    p_assessment_id: assessmentId,
    p_attachment_type: body.attachmentType,
    p_file_url: body.fileUrl ?? null,
    p_github_url: body.githubUrl ?? null,
    p_file_name: body.fileName ?? null,
    p_file_size_bytes: body.fileSizeBytes ?? null,
    p_mime_type: body.mimeType ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateAttachment = async (
  id: number,
  body: UpdateAssessmentAttachmentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_assessment_attachments', {
    p_id: id,
    p_attachment_type: body.attachmentType ?? null,
    p_file_url: body.fileUrl !== undefined ? (body.fileUrl ?? '') : null,
    p_github_url: body.githubUrl !== undefined ? (body.githubUrl ?? '') : null,
    p_file_name: body.fileName !== undefined ? (body.fileName ?? '') : null,
    p_file_size_bytes: body.fileSizeBytes ?? null,
    p_mime_type: body.mimeType !== undefined ? (body.mimeType ?? '') : null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteAttachment = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_assessment_attachments', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreAttachment = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_assessment_attachments', {
    p_id: id,
    p_restore_children: true,
    p_restored_by: callerId
  });
};

// ─── Attachment Translation CRUD ───────────────────────────────

export interface ListTranslationsResult {
  rows: AssessmentAttachmentDto[];
  meta: PaginationMeta;
}

export const listAttachmentTranslations = async (
  attachmentId: number,
  q: ListAttachmentTranslationsQuery
): Promise<ListTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<AttachmentRow>(
    'udf_get_assessment_attachments',
    {
      p_id: attachmentId,
      p_assessment_id: null,
      p_language_id: q.languageId ?? null,
      p_filter_attachment_type: null,
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

export const getAttachmentTranslationById = async (
  id: number
): Promise<AssessmentAttachmentDto | null> => {
  const result = await db.query<AttachmentRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_assessment_attachment_translations WHERE aat_id = $1 LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
};

export const createAttachmentTranslation = async (
  attachmentId: number,
  body: CreateAttachmentTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_assessment_attachment_translations', {
    p_assessment_attachment_id: attachmentId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateAttachmentTranslation = async (
  id: number,
  body: UpdateAttachmentTranslationBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_assessment_attachment_translations', {
    p_id: id,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteAttachmentTranslation = async (
  id: number,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_assessment_attachment_translations', { p_id: id });
};

export const restoreAttachmentTranslation = async (
  id: number,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_assessment_attachment_translations', { p_id: id });
};
