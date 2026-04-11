// ═══════════════════════════════════════════════════════════════
// user-permissions.service — UDF wrappers for the user-level
// permission override junction (grant / deny on top of role_permissions).
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  AssignUserPermissionBody,
  GrantType,
  ListUserPermissionsQuery,
  RevokeUserPermissionBody
} from './user-permissions.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserPermissionDto {
  id: number;
  userId: number;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
  permissionId: number;
  permissionName: string;
  permissionCode: string;
  resource: string;
  action: string;
  scope: string;
  grantType: GrantType;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface UserPermissionRow {
  up_id: number | string;
  up_user_id: number | string;
  up_user_first_name: string | null;
  up_user_last_name: string | null;
  up_user_email: string | null;
  up_permission_id: number | string;
  up_perm_name: string;
  up_perm_code: string;
  up_perm_resource: string;
  up_perm_action: string;
  up_perm_scope: string;
  up_grant_type: string;
  up_is_active: boolean;
  up_is_deleted: boolean;
  up_created_at: Date | string | null;
  up_updated_at: Date | string | null;
  up_deleted_at: Date | string | null;
}

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapUserPermission = (row: UserPermissionRow): UserPermissionDto => ({
  id: Number(row.up_id),
  userId: Number(row.up_user_id),
  userFirstName: row.up_user_first_name,
  userLastName: row.up_user_last_name,
  userEmail: row.up_user_email,
  permissionId: Number(row.up_permission_id),
  permissionName: row.up_perm_name,
  permissionCode: row.up_perm_code,
  resource: row.up_perm_resource,
  action: row.up_perm_action,
  scope: row.up_perm_scope,
  grantType: (row.up_grant_type === 'deny' ? 'deny' : 'grant') as GrantType,
  isActive: row.up_is_active,
  isDeleted: row.up_is_deleted,
  createdAt: toIso(row.up_created_at),
  updatedAt: toIso(row.up_updated_at),
  deletedAt: toIso(row.up_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserPermissionsResult {
  rows: UserPermissionDto[];
  meta: PaginationMeta;
}

export const listUserPermissions = async (
  q: ListUserPermissionsQuery
): Promise<ListUserPermissionsResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserPermissionRow>(
    'udf_get_user_permissions',
    {
      p_filter_user_id: q.userId ?? null,
      p_filter_permission_id: q.permissionId ?? null,
      p_filter_grant_type: q.grantType ?? null,
      p_filter_perm_resource: q.resource ?? null,
      p_filter_perm_action: q.action ?? null,
      p_filter_perm_scope: q.scope ?? null,
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
    rows: rows.map(mapUserPermission),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getUserPermissionById = async (
  id: number
): Promise<UserPermissionDto | null> => {
  const { rows } = await db.callTableFunction<UserPermissionRow>(
    'udf_get_user_permissions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserPermission(row) : null;
};

// ─── Assign (grant | deny) ──────────────────────────────────────

export const assignUserPermission = async (
  body: AssignUserPermissionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_user_permissions_assign', {
    p_user_id: body.userId,
    p_permission_id: body.permissionId,
    p_grant_type: body.grantType,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Revoke (by user+permission pair) ───────────────────────────

export const revokeUserPermission = async (
  body: RevokeUserPermissionBody
): Promise<void> => {
  await db.callFunction('udf_user_permissions_revoke', {
    p_user_id: body.userId,
    p_permission_id: body.permissionId
  });
};

// ─── Delete / Restore (by junction id) ──────────────────────────

export const deleteUserPermission = async (id: number): Promise<void> => {
  await db.callFunction('udf_user_permissions_delete', { p_id: id });
};

export const restoreUserPermission = async (id: number): Promise<void> => {
  await db.callFunction('udf_user_permissions_restore', { p_id: id });
};
