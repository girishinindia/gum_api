// ═══════════════════════════════════════════════════════════════
// user-documents.service — UDF wrappers for /api/v1/user-documents.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_documents     (read / list with filters + sort)
//   - udf_insert_user_document   (create, 1:M with users)
//   - udf_update_user_document   (partial update, COALESCE pattern)
//   - udf_delete_user_document   (soft-delete)
//   - udf_restore_user_document  (un-soft-delete, admin+ only)
//
// Ownership model:
//   user_documents is a 1:M child of users. It has its own
//   is_active / is_deleted flags (soft-delete model). Deleted rows
//   are hidden by the GET function's default WHERE filter. Admin +
//   super_admin can restore via POST /:id/restore — instructor and
//   student roles cannot.
//
// The admin/self split (blocking verification workflow fields from
// the self lane) is enforced at the schema layer. This service
// just maps camelCase DTO → p_ UDF params, so whatever the schema
// lets through reaches the DB verbatim.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserDocumentBody,
  CreateUserDocumentBody,
  ListUserDocumentsQuery,
  UpdateMyUserDocumentBody,
  UpdateUserDocumentBody
} from './user-documents.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserDocumentDocumentDto {
  id: number;
  name: string | null;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserDocumentDocumentTypeDto {
  id: number;
  name: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserDocumentOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserDocumentDto {
  id: number;
  userId: number;
  documentTypeId: number;
  documentId: number;
  documentNumber: string | null;
  fileUrl: string;
  fileName: string | null;
  fileSizeKb: number | null;
  fileFormat: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingAuthority: string | null;

  verificationStatus: string;
  verifiedBy: number | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  adminNotes: string | null;

  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserDocumentOwnerDto;
  document: UserDocumentDocumentDto;
  documentType: UserDocumentDocumentTypeDto;
}

// ─── Row shape from udf_get_user_documents ─────────────────────

interface UserDocumentRow {
  udoc_id: number | string;
  udoc_user_id: number | string;
  udoc_document_type_id: number | string;
  udoc_document_id: number | string;
  udoc_document_number: string | null;
  udoc_file_url: string;
  udoc_file_name: string | null;
  udoc_file_size_kb: number | string | null;
  udoc_file_format: string | null;
  udoc_issue_date: Date | string | null;
  udoc_expiry_date: Date | string | null;
  udoc_issuing_authority: string | null;
  udoc_verification_status: string;
  udoc_verified_by: number | string | null;
  udoc_verified_at: Date | string | null;
  udoc_rejection_reason: string | null;
  udoc_admin_notes: string | null;
  udoc_created_by: number | string | null;
  udoc_updated_by: number | string | null;
  udoc_is_active: boolean;
  udoc_is_deleted: boolean;
  udoc_created_at: Date | string | null;
  udoc_updated_at: Date | string | null;
  udoc_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;

  document_name: string | null;
  document_description: string | null;
  document_is_active: boolean;
  document_is_deleted: boolean;

  document_type_id: number | string;
  document_type_name: string | null;
  document_type_is_active: boolean;
  document_type_is_deleted: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toDateOnly = (v: Date | string | null): string | null => {
  if (v == null) return null;
  // DATE columns come back as YYYY-MM-DD already; be defensive.
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  // Use local date components to avoid UTC offset shifting dates by -1 day
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, '0');
  const d = String(v.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserDocument = (row: UserDocumentRow): UserDocumentDto => ({
  id: Number(row.udoc_id),
  userId: Number(row.udoc_user_id),
  documentTypeId: Number(row.udoc_document_type_id),
  documentId: Number(row.udoc_document_id),
  documentNumber: row.udoc_document_number,
  fileUrl: row.udoc_file_url,
  fileName: row.udoc_file_name,
  fileSizeKb: toNumOrNull(row.udoc_file_size_kb),
  fileFormat: row.udoc_file_format,
  issueDate: toDateOnly(row.udoc_issue_date),
  expiryDate: toDateOnly(row.udoc_expiry_date),
  issuingAuthority: row.udoc_issuing_authority,

  verificationStatus: row.udoc_verification_status,
  verifiedBy: toNumOrNull(row.udoc_verified_by),
  verifiedAt: toIso(row.udoc_verified_at),
  rejectionReason: row.udoc_rejection_reason,
  adminNotes: row.udoc_admin_notes,

  createdBy: toNumOrNull(row.udoc_created_by),
  updatedBy: toNumOrNull(row.udoc_updated_by),
  isActive: row.udoc_is_active,
  isDeleted: row.udoc_is_deleted,
  createdAt: toIso(row.udoc_created_at),
  updatedAt: toIso(row.udoc_updated_at),
  deletedAt: toIso(row.udoc_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  },

  document: {
    id: Number(row.udoc_document_id),
    name: row.document_name,
    description: row.document_description,
    isActive: row.document_is_active,
    isDeleted: row.document_is_deleted
  },

  documentType: {
    id: Number(row.document_type_id),
    name: row.document_type_name,
    isActive: row.document_type_is_active,
    isDeleted: row.document_type_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserDocumentsResult {
  rows: UserDocumentDto[];
  meta: PaginationMeta;
}

export const listUserDocuments = async (
  q: ListUserDocumentsQuery
): Promise<ListUserDocumentsResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserDocumentRow>(
    'udf_get_user_documents',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_document_id: q.documentId ?? null,
      p_filter_document_type_id: q.documentTypeId ?? null,
      p_filter_verification_status: q.verificationStatus ?? null,
      p_filter_file_format: q.fileFormat ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_filter_user_role: q.userRole ?? null,
      p_filter_user_is_active: q.userIsActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapUserDocument),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id (visible lane) ──────────────────────────────────

export const getUserDocumentById = async (
  id: number
): Promise<UserDocumentDto | null> => {
  const { rows } = await db.callTableFunction<UserDocumentRow>(
    'udf_get_user_documents',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserDocument(row) : null;
};

// ─── Get by id (admin lane — includes soft-deleted) ───────────
// Used by the restore route so it can surface 404 vs 400 cleanly.

export const getUserDocumentByIdIncludingDeleted = async (
  id: number
): Promise<UserDocumentDto | null> => {
  const visible = await db.callTableFunction<UserDocumentRow>(
    'udf_get_user_documents',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserDocument(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserDocumentRow>(
    'udf_get_user_documents',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserDocument(deleted.rows[0]) : null;
};

// ─── Create ─────────────────────────────────────────────────────

export interface CreateUserDocumentResult {
  id: number;
}

// Note: udf_insert_user_document does NOT accept verified_by / verified_at /
// rejection_reason / admin_notes — those are update-only workflow fields that
// an admin sets AFTER a user submits a document. New documents always start
// at verification_status='pending' (or under_review if the admin creates it
// directly), so we only pass verification_status through here.
const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserDocumentBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_document_type_id: body.documentTypeId ?? null,
  p_document_id: body.documentId ?? null,
  p_file_url: body.fileUrl ?? null,
  p_document_number: body.documentNumber ?? null,
  p_file_name: body.fileName ?? null,
  p_file_size_kb: body.fileSizeKb ?? null,
  p_file_format: body.fileFormat ?? null,
  p_issue_date: body.issueDate ?? null,
  p_expiry_date: body.expiryDate ?? null,
  p_issuing_authority: body.issuingAuthority ?? null,
  p_verification_status: body.verificationStatus ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserDocument = async (
  body: CreateUserDocumentBody,
  callerId: number | null
): Promise<CreateUserDocumentResult> => {
  const result = await db.callFunction(
    'udf_insert_user_document',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserDocument = async (
  userId: number,
  body: CreateMyUserDocumentBody
): Promise<CreateUserDocumentResult> => {
  const result = await db.callFunction(
    'udf_insert_user_document',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ─────────────────────────────────────────────────────

const buildUpdateParams = (
  id: number,
  body: UpdateUserDocumentBody | UpdateMyUserDocumentBody,
  callerId: number | null
): Record<string, unknown> => {
  // The self-lane body is a subset of the admin body, so we cast once
  // and read the admin-only fields defensively.
  const b = body as UpdateUserDocumentBody;
  return {
    p_id: id,
    p_document_type_id: b.documentTypeId ?? null,
    p_document_id: b.documentId ?? null,
    p_document_number: b.documentNumber ?? null,
    p_file_url: b.fileUrl ?? null,
    p_file_name: b.fileName ?? null,
    p_file_size_kb: b.fileSizeKb ?? null,
    p_file_format: b.fileFormat ?? null,
    p_issue_date: b.issueDate ?? null,
    p_expiry_date: b.expiryDate ?? null,
    p_issuing_authority: b.issuingAuthority ?? null,
    p_verification_status: b.verificationStatus ?? null,
    p_verified_by: b.verifiedBy ?? null,
    p_verified_at: b.verifiedAt ?? null,
    p_rejection_reason: b.rejectionReason ?? null,
    p_admin_notes: b.adminNotes ?? null,
    p_is_active: b.isActive ?? null,
    p_actor_id: callerId
  };
};

export const updateUserDocument = async (
  id: number,
  body: UpdateUserDocumentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_document', buildUpdateParams(id, body, callerId));
};

export const updateMyUserDocument = async (
  id: number,
  body: UpdateMyUserDocumentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_document', buildUpdateParams(id, body, callerId));
};

// ─── Delete (soft) ──────────────────────────────────────────────

export const deleteUserDocument = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_document', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────

export const restoreUserDocument = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_document', {
    p_id: id,
    p_actor_id: callerId
  });
};
