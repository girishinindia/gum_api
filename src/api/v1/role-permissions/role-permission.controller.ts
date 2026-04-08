import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { rolePermissionService } from '../../../modules/role-permissions/role-permission.service';

// ─── List role-permission mappings ──────────────────────────

export const listRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    roleId: req.query.roleId ? Number(req.query.roleId) : undefined,
    roleCode: req.query.roleCode as string | undefined,
    permissionId: req.query.permissionId ? Number(req.query.permissionId) : undefined,
    filterModuleCode: req.query.moduleCode as string | undefined,
    filterAction: req.query.action as string | undefined,
    filterScope: req.query.scope as string | undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await rolePermissionService.list(query);
  return sendSuccess(res, data, 'Role permissions fetched');
});

// ─── Assign single permission to role ───────────────────────

export const assignPermission = asyncHandler(async (req: Request, res: Response) => {
  const { roleId, permissionId } = req.body;
  const createdBy = req.user!.userId;
  const data = await rolePermissionService.assign(roleId, permissionId, createdBy);
  return sendSuccess(res, data, 'Permission assigned to role', 201);
});

// ─── Bulk assign permissions to role ────────────────────────

export const bulkAssignPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { roleId, permissionIds } = req.body;
  const createdBy = req.user!.userId;
  const data = await rolePermissionService.bulkAssign(roleId, permissionIds, createdBy);
  return sendSuccess(res, data, 'Permissions assigned to role', 201);
});

// ─── Remove single permission from role ─────────────────────

export const removePermission = asyncHandler(async (req: Request, res: Response) => {
  const { roleId, permissionId } = req.body;
  const data = await rolePermissionService.remove(roleId, permissionId);
  return sendSuccess(res, data, 'Permission removed from role');
});

// ─── Remove all permissions from role ───────────────────────

export const bulkRemovePermissions = asyncHandler(async (req: Request, res: Response) => {
  const roleId = Number(req.params.roleId);
  const data = await rolePermissionService.bulkRemove(roleId);
  return sendSuccess(res, data, 'All permissions removed from role');
});

// ─── Replace all permissions for role (atomic) ──────────────

export const replacePermissions = asyncHandler(async (req: Request, res: Response) => {
  const { roleId, permissionIds } = req.body;
  const createdBy = req.user!.userId;
  const data = await rolePermissionService.replace(roleId, permissionIds, createdBy);
  return sendSuccess(res, data, 'Role permissions replaced');
});

// ─── Get all permissions for a user ─────────────────────────

export const getUserPermissions = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const data = await rolePermissionService.getUserPermissions(userId);
  return sendSuccess(res, data, 'User permissions fetched');
});

// ─── Get own permissions (authenticated user) ───────────────

export const getMyPermissions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await rolePermissionService.getUserPermissions(userId);
  return sendSuccess(res, data, 'Your permissions fetched');
});
