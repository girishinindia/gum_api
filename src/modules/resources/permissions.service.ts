// ═══════════════════════════════════════════════════════════════
// permissions.service — UDF wrappers for the permissions CRUD module.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreatePermissionBody,
  ListPermissionsQuery,
  UpdatePermissionBody
} from './permissions.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface PermissionDto {
  id: number;
  name: string;
  code: string;
  description: string | null;
  resource: string;
  action: string;
  scope: string;
  displayOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface PermissionRow {
  perm_id: number | string;
  perm_name: string;
  perm_code: string;
  perm_description: string | null;
  perm_resource: string;
  perm_action: string;
  perm_scope: string;
  perm_display_order: number;
  perm_is_active: boolean;
  perm_is_deleted: boolean;
  perm_created_at: Date | string | null;
  perm_updated_at: Date | string | null;
  perm_deleted_at: Date | string | null;
}

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapPermission = (row: PermissionRow): PermissionDto => ({
  id: Number(row.perm_id),
  name: row.perm_name,
  code: row.perm_code,
  description: row.perm_description,
  resource: row.perm_resource,
  action: row.perm_action,
  scope: row.perm_scope,
  displayOrder: row.perm_display_order,
  isActive: row.perm_is_active,
  isDeleted: row.perm_is_deleted,
  createdAt: toIso(row.perm_created_at),
  updatedAt: toIso(row.perm_updated_at),
  deletedAt: toIso(row.perm_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListPermissionsResult {
  rows: PermissionDto[];
  meta: PaginationMeta;
}

export const listPermissions = async (
  q: ListPermissionsQuery
): Promise<ListPermissionsResult> => {
  const { rows, totalCount } = await db.callTableFunction<PermissionRow>(
    'udf_get_permissions',
    {
      p_code: q.code ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_resource: q.resource ?? null,
      p_filter_action: q.action ?? null,
      p_filter_scope: q.scope ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapPermission),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getPermissionById = async (
  id: number
): Promise<PermissionDto | null> => {
  const { rows } = await db.callTableFunction<PermissionRow>(
    'udf_get_permissions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapPermission(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export const createPermission = async (
  body: CreatePermissionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_permissions_insert', {
    p_name: body.name,
    p_code: body.code,
    p_resource: body.resource,
    p_action: body.action,
    p_scope: body.scope,
    p_description: body.description ?? null,
    p_display_order: body.displayOrder,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updatePermission = async (
  id: number,
  body: UpdatePermissionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_permissions_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_code: body.code ?? null,
    p_description: body.description ?? null,
    p_resource: body.resource ?? null,
    p_action: body.action ?? null,
    p_scope: body.scope ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete / Restore ────────────────────────────────────────────

export const deletePermission = async (id: number): Promise<void> => {
  await db.callFunction('udf_permissions_delete', { p_id: id });
};

export const restorePermission = async (id: number): Promise<void> => {
  await db.callFunction('udf_permissions_restore', { p_id: id });
};
