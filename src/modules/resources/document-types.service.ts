// ═══════════════════════════════════════════════════════════════
// document-types.service — UDF wrappers for /api/v1/document-types
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateDocumentTypeBody,
  ListDocumentTypesQuery,
  UpdateDocumentTypeBody
} from './document-types.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface DocumentTypeDto {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface DocumentTypeRow {
  document_type_id: number | string;
  document_type_name: string;
  document_type_description: string | null;
  document_type_created_by: number | string | null;
  document_type_updated_by: number | string | null;
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

const mapDocumentType = (row: DocumentTypeRow): DocumentTypeDto => ({
  id: Number(row.document_type_id),
  name: row.document_type_name,
  description: row.document_type_description,
  isActive: row.document_type_is_active,
  isDeleted: row.document_type_is_deleted,
  createdAt: toIsoString(row.document_type_created_at),
  updatedAt: toIsoString(row.document_type_updated_at),
  deletedAt: toIsoString(row.document_type_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListDocumentTypesResult {
  rows: DocumentTypeDto[];
  meta: PaginationMeta;
}

export const listDocumentTypes = async (
  q: ListDocumentTypesQuery
): Promise<ListDocumentTypesResult> => {
  const { rows, totalCount } = await db.callTableFunction<DocumentTypeRow>(
    'udf_get_document_types',
    {
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapDocumentType),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getDocumentTypeById = async (
  id: number
): Promise<DocumentTypeDto | null> => {
  const { rows } = await db.callTableFunction<DocumentTypeRow>(
    'udf_get_document_types',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapDocumentType(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateDocumentTypeResult {
  id: number;
}

export const createDocumentType = async (
  body: CreateDocumentTypeBody,
  callerId: number | null
): Promise<CreateDocumentTypeResult> => {
  const result = await db.callFunction('udf_document_types_insert', {
    p_name: body.name,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateDocumentType = async (
  id: number,
  body: UpdateDocumentTypeBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_document_types_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteDocumentType = async (id: number): Promise<void> => {
  await db.callFunction('udf_document_types_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreDocumentType = async (id: number): Promise<void> => {
  await db.callFunction('udf_document_types_restore', { p_id: id });
};
