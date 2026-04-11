// ═══════════════════════════════════════════════════════════════
// role-permissions.service — UDF wrappers for the RBAC junction
// between roles and permissions.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  AssignRolePermissionBody,
  ListRolePermissionsQuery,
  RevokeRolePermissionBody
} from './role-permissions.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface RolePermissionDto {
  id: number;
  roleId: number;
  roleName: string;
  roleCode: string;
  roleLevel: number;
  permissionId: number;
  permissionName: string;
  permissionCode: string;
  resource: string;
  action: string;
  scope: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface RolePermissionRow {
  rp_id: number | string;
  rp_role_id: number | string;
  rp_role_name: string;
  rp_role_code: string;
  rp_role_level: number;
  rp_permission_id: number | string;
  rp_perm_name: string;
  rp_perm_code: string;
  rp_perm_resource: string;
  rp_perm_action: string;
  rp_perm_scope: string;
  rp_is_active: boolean;
  rp_is_deleted: boolean;
  rp_created_at: Date | string | null;
  rp_updated_at: Date | string | null;
  rp_deleted_at: Date | string | null;
}

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRolePermission = (row: RolePermissionRow): RolePermissionDto => ({
  id: Number(row.rp_id),
  roleId: Number(row.rp_role_id),
  roleName: row.rp_role_name,
  roleCode: row.rp_role_code,
  roleLevel: row.rp_role_level,
  permissionId: Number(row.rp_permission_id),
  permissionName: row.rp_perm_name,
  permissionCode: row.rp_perm_code,
  resource: row.rp_perm_resource,
  action: row.rp_perm_action,
  scope: row.rp_perm_scope,
  isActive: row.rp_is_active,
  isDeleted: row.rp_is_deleted,
  createdAt: toIso(row.rp_created_at),
  updatedAt: toIso(row.rp_updated_at),
  deletedAt: toIso(row.rp_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListRolePermissionsResult {
  rows: RolePermissionDto[];
  meta: PaginationMeta;
}

export const listRolePermissions = async (
  q: ListRolePermissionsQuery
): Promise<ListRolePermissionsResult> => {
  const { rows, totalCount } = await db.callTableFunction<RolePermissionRow>(
    'udf_get_role_permissions',
    {
      p_filter_role_id: q.roleId ?? null,
      p_filter_role_code: q.roleCode ?? null,
      p_filter_permission_id: q.permissionId ?? null,
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
    rows: rows.map(mapRolePermission),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getRolePermissionById = async (
  id: number
): Promise<RolePermissionDto | null> => {
  const { rows } = await db.callTableFunction<RolePermissionRow>(
    'udf_get_role_permissions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRolePermission(row) : null;
};

// ─── Assign ──────────────────────────────────────────────────────

export const assignRolePermission = async (
  body: AssignRolePermissionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_role_permissions_assign', {
    p_role_id: body.roleId,
    p_permission_id: body.permissionId,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Revoke (by role+permission pair) ───────────────────────────

export const revokeRolePermission = async (
  body: RevokeRolePermissionBody
): Promise<void> => {
  await db.callFunction('udf_role_permissions_revoke', {
    p_role_id: body.roleId,
    p_permission_id: body.permissionId
  });
};

// ─── Delete / Restore (by junction id) ──────────────────────────

export const deleteRolePermission = async (id: number): Promise<void> => {
  await db.callFunction('udf_role_permissions_delete', { p_id: id });
};

export const restoreRolePermission = async (id: number): Promise<void> => {
  await db.callFunction('udf_role_permissions_restore', { p_id: id });
};
