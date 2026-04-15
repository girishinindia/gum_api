// ═══════════════════════════════════════════════════════════════
// documents.service — UDF wrappers for /api/v1/documents
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';

import type {
  CreateDocumentBody,
  ListDocumentsQuery,
  UpdateDocumentBody
} from './documents.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface DocumentDto {
  id: number;
  documentTypeId: number;
  name: string;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  documentType: {
    id: number;
    name: string;
    description: string | null;
    isActive: boolean;
    isDeleted: boolean;
  };
}

interface DocumentRow {
  document_id: number | string;
  document_document_type_id: number | string;
  document_name: string;
  document_description: string | null;
  document_created_by: number | string | null;
  document_updated_by: number | string | null;
  document_is_active: boolean;
  document_is_deleted: boolean;
  document_created_at: Date | string | null;
  document_updated_at: Date | string | null;
  document_deleted_at: Date | string | null;

  document_type_id: number | string;
  document_type_name: string;
  document_type_description: string | null;
  document_type_is_active: boolean;
  document_type_is_deleted: boolean;
  document_type_created_at: Date | string | null;
  document_type_updated_at: Date | string | null;
  document_type_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapDocument = (row: DocumentRow): DocumentDto => ({
  id: Number(row.document_id),
  documentTypeId: Number(row.document_document_type_id),
  name: row.document_name,
  description: row.document_description,
  isActive: row.document_is_active,
  isDeleted: row.document_is_deleted,
  createdAt: toIsoString(row.document_created_at),
  updatedAt: toIsoString(row.document_updated_at),
  deletedAt: toIsoString(row.document_deleted_at),
  documentType: {
    id: Number(row.document_type_id),
    name: row.document_type_name,
    description: row.document_type_description,
    isActive: row.document_type_is_active,
    isDeleted: row.document_type_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListDocumentsResult {
  rows: DocumentDto[];
  meta: PaginationMeta;
}

export const listDocuments = async (q: ListDocumentsQuery): Promise<ListDocumentsResult> => {
  const { filterIsDeleted: docTypeDeleted, hideDeleted: hideDocTypeDeleted } =
    resolveIsDeletedFilter(q.documentTypeIsDeleted);
  const { filterIsDeleted: docDeleted, hideDeleted: hideDocDeleted } =
    resolveIsDeletedFilter(q.isDeleted);
  const { rows, totalCount } = await db.callTableFunction<DocumentRow>(
    'udf_get_documents',
    {
      p_document_is_active: q.isActive ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_document_type_id: q.documentTypeId ?? null,
      p_filter_document_type_is_active: q.documentTypeIsActive ?? null,
      p_filter_document_type_is_deleted: docTypeDeleted,
      p_hide_document_type_deleted: hideDocTypeDeleted,
      p_filter_document_is_active: q.isActive ?? null,
      p_filter_document_is_deleted: docDeleted,
      p_hide_document_deleted: hideDocDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapDocument),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getDocumentById = async (id: number): Promise<DocumentDto | null> => {
  const { rows } = await db.callTableFunction<DocumentRow>('udf_get_documents', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapDocument(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateDocumentResult {
  id: number;
}

export const createDocument = async (
  body: CreateDocumentBody,
  callerId: number | null
): Promise<CreateDocumentResult> => {
  const result = await db.callFunction('udf_documents_insert', {
    p_document_type_id: body.documentTypeId,
    p_name: body.name,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateDocument = async (
  id: number,
  body: UpdateDocumentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_documents_update', {
    p_id: id,
    p_document_type_id: body.documentTypeId ?? null,
    p_name: body.name ?? null,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteDocument = async (id: number): Promise<void> => {
  await db.callFunction('udf_documents_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreDocument = async (id: number): Promise<void> => {
  await db.callFunction('udf_documents_restore', { p_id: id });
};
