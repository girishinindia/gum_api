import { AppError } from '../../core/errors/app-error';
import { db } from '../../database/db';
import { rolePermissionRepository } from './role-permission.repository';
import {
  RolePermissionRow,
  RolePermissionResponse,
  RolePermissionListQuery,
  UserPermissionRow,
  UserPermissionResponse
} from './role-permission.types';

// ─── Protected role codes ───────────────────────────────────
// Admin users cannot modify permissions for these roles.
// Only Super Admin can assign/remove/replace permissions on
// super_admin or admin roles.

const ADMIN_BLOCKED_ROLE_CODES = ['super_admin', 'admin'];

// ─── Row → Response Mappers ─────────────────────────────────

const toRolePermissionResponse = (row: RolePermissionRow): RolePermissionResponse => ({
  id: row.rp_id,
  roleId: row.rp_role_id,
  roleName: row.rp_role_name,
  roleCode: row.rp_role_code,
  permissionId: row.rp_permission_id,
  permissionName: row.rp_permission_name,
  permissionCode: row.rp_permission_code,
  permissionResource: row.rp_permission_resource,
  permissionAction: row.rp_permission_action,
  permissionScope: row.rp_permission_scope,
  moduleName: row.rp_module_name,
  moduleCode: row.rp_module_code,
  isActive: row.rp_is_active,
  createdAt: row.rp_created_at
});

const toUserPermissionResponse = (row: UserPermissionRow): UserPermissionResponse => ({
  permissionCode: row.permission_code,
  permissionName: row.permission_name,
  moduleCode: row.module_code,
  roleCode: row.role_code,
  scope: row.scope
});

// ─── Role-Permission Service ────────────────────────────────

class RolePermissionService {

  // ─── Helper: Get the highest role code of a user ───────────

  private async getUserRoleCode(userId: number): Promise<string | null> {
    const row = await db.queryOne<{ role_code: string }>(
      `SELECT r.code AS role_code
       FROM user_role_assignments ura
       INNER JOIN roles r ON ura.role_id = r.id
       WHERE ura.user_id = $1
         AND ura.is_deleted = FALSE
         AND ura.is_active = TRUE
         AND r.is_deleted = FALSE
       ORDER BY r.level ASC
       LIMIT 1`,
      [userId]
    );
    return row?.role_code ?? null;
  }

  // ─── Helper: Get role code by role ID ──────────────────────

  private async getRoleCodeById(roleId: number): Promise<string | null> {
    const row = await db.queryOne<{ code: string }>(
      'SELECT code FROM roles WHERE id = $1 AND is_deleted = FALSE',
      [roleId]
    );
    return row?.code ?? null;
  }

  // ─── Guard: Admin cannot modify admin/super_admin perms ────

  private async guardAdminModifyingAdmin(roleId: number, currentUserId?: number): Promise<void> {
    if (!currentUserId) return;

    const targetRoleCode = await this.getRoleCodeById(roleId);
    if (!targetRoleCode || !ADMIN_BLOCKED_ROLE_CODES.includes(targetRoleCode)) return;

    const currentUserRole = await this.getUserRoleCode(currentUserId);

    if (currentUserRole === 'admin') {
      throw new AppError(
        'Admins cannot modify permissions for Super Admin or Admin roles. Only Super Admin can do this.',
        403,
        'ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS'
      );
    }
  }

  /** List role-permission mappings with filters */
  async list(query: RolePermissionListQuery) {
    const { rows, totalCount } = await rolePermissionRepository.findAll(query);
    return {
      rolePermissions: rows.map(toRolePermissionResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  /** Assign a single permission to a role */
  async assign(roleId: number, permissionId: number, createdBy?: number) {
    await this.guardAdminModifyingAdmin(roleId, createdBy);
    const result = await rolePermissionRepository.assign(roleId, permissionId, createdBy);
    return { message: result.message, id: result.id };
  }

  /** Assign multiple permissions to a role */
  async bulkAssign(roleId: number, permissionIds: number[], createdBy?: number) {
    await this.guardAdminModifyingAdmin(roleId, createdBy);
    const result = await rolePermissionRepository.bulkAssign(roleId, permissionIds, createdBy);
    return { message: result.message, insertedCount: result.inserted_count };
  }

  /** Remove a single permission from a role */
  async remove(roleId: number, permissionId: number, currentUserId?: number) {
    await this.guardAdminModifyingAdmin(roleId, currentUserId);
    const result = await rolePermissionRepository.remove(roleId, permissionId);
    return { message: result.message };
  }

  /** Remove all permissions from a role */
  async bulkRemove(roleId: number, currentUserId?: number) {
    await this.guardAdminModifyingAdmin(roleId, currentUserId);
    const result = await rolePermissionRepository.bulkRemove(roleId);
    return { message: result.message, deletedCount: result.deleted_count };
  }

  /** Atomically replace all permissions for a role */
  async replace(roleId: number, permissionIds: number[], createdBy?: number) {
    await this.guardAdminModifyingAdmin(roleId, createdBy);
    const result = await rolePermissionRepository.replace(roleId, permissionIds, createdBy);
    return {
      message: result.message,
      removedCount: result.removed_count,
      addedCount: result.added_count
    };
  }

  /** Get all permissions for a specific user (across all their roles) */
  async getUserPermissions(userId: number) {
    const rows = await rolePermissionRepository.getUserPermissions(userId);
    return rows.map(toUserPermissionResponse);
  }

  /** Check if a user has a specific permission */
  async userHasPermission(userId: number, permissionCode: string) {
    const hasPermission = await rolePermissionRepository.userHasPermission(userId, permissionCode);
    return { hasPermission };
  }
}

export const rolePermissionService = new RolePermissionService();
