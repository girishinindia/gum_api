import { db } from '../../database/db';
import { RolePermissionRow, RolePermissionListQuery, UserPermissionRow } from './role-permission.types';

// ─── Role-Permission Repository (PostgreSQL via UDFs) ───────

export const rolePermissionRepository = {

  // ─── List ─────────────────────────────────────────────────

  async findAll(query: RolePermissionListQuery): Promise<{ rows: RolePermissionRow[]; totalCount: number }> {
    return db.callTableFunction<RolePermissionRow>('udf_get_role_permissions', {
      p_role_id: query.roleId,
      p_role_code: query.roleCode,
      p_permission_id: query.permissionId,
      p_filter_module_code: query.filterModuleCode,
      p_filter_action: query.filterAction,
      p_filter_scope: query.filterScope,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  // ─── Assign (single) ─────────────────────────────────────

  async assign(roleId: number, permissionId: number, createdBy?: number) {
    return db.callFunction('udf_role_permissions_insert', {
      p_role_id: roleId,
      p_permission_id: permissionId,
      p_created_by: createdBy ?? null
    });
  },

  // ─── Assign (bulk) ───────────────────────────────────────

  async bulkAssign(roleId: number, permissionIds: number[], createdBy?: number) {
    // UDF expects BIGINT[] — pass as raw SQL array via db.query
    const result = await db.query<{ result: { success: boolean; message: string; inserted_count: number } }>(
      'SELECT udf_role_permissions_bulk_insert(p_role_id := $1, p_permission_ids := $2, p_created_by := $3) AS result',
      [roleId, permissionIds, createdBy ?? null]
    );
    const row = result.rows[0]?.result;
    if (!row?.success) {
      const { AppError } = await import('../../core/errors/app-error');
      throw new AppError(row?.message ?? 'Bulk assign failed', 400, 'UDF_ERROR');
    }
    return row;
  },

  // ─── Remove (single) ─────────────────────────────────────

  async remove(roleId: number, permissionId: number) {
    return db.callFunction('udf_role_permissions_delete', {
      p_role_id: roleId,
      p_permission_id: permissionId
    });
  },

  // ─── Remove all from role ─────────────────────────────────

  async bulkRemove(roleId: number) {
    const result = await db.query<{ result: { success: boolean; message: string; deleted_count: number } }>(
      'SELECT udf_role_permissions_bulk_delete(p_role_id := $1) AS result',
      [roleId]
    );
    const row = result.rows[0]?.result;
    if (!row?.success) {
      const { AppError } = await import('../../core/errors/app-error');
      throw new AppError(row?.message ?? 'Bulk remove failed', 400, 'UDF_ERROR');
    }
    return row;
  },

  // ─── Replace (atomic) ────────────────────────────────────

  async replace(roleId: number, permissionIds: number[], createdBy?: number) {
    const result = await db.query<{ result: { success: boolean; message: string; removed_count: number; added_count: number } }>(
      'SELECT udf_role_permissions_replace(p_role_id := $1, p_permission_ids := $2, p_created_by := $3) AS result',
      [roleId, permissionIds, createdBy ?? null]
    );
    const row = result.rows[0]?.result;
    if (!row?.success) {
      const { AppError } = await import('../../core/errors/app-error');
      throw new AppError(row?.message ?? 'Replace failed', 400, 'UDF_ERROR');
    }
    return row;
  },

  // ─── Check user permission ────────────────────────────────

  async userHasPermission(userId: number, permissionCode: string): Promise<boolean> {
    const row = await db.queryOne<{ has_permission: boolean }>(
      'SELECT udf_user_has_permission($1, $2) AS has_permission',
      [userId, permissionCode]
    );
    return row?.has_permission ?? false;
  },

  // ─── Get all user permissions ─────────────────────────────

  async getUserPermissions(userId: number): Promise<UserPermissionRow[]> {
    const { rows } = await db.callTableFunction<UserPermissionRow>('udf_user_permissions', {
      p_user_id: userId
    });
    return rows;
  }
};
