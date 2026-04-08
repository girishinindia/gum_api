import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { roleService } from '../../../modules/roles/role.service';

// ─── List ───────────────────────────────────────────────────

export const listRoles = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    isActive: req.query.isActive != null ? req.query.isActive === 'true' : undefined,
    filterLevel: req.query.level ? Number(req.query.level) : undefined,
    filterParentRoleId: req.query.parentRoleId ? Number(req.query.parentRoleId) : undefined,
    filterIsSystemRole: req.query.isSystemRole != null ? req.query.isSystemRole === 'true' : undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await roleService.list(query);
  return sendSuccess(res, data, 'Roles fetched');
});

// ─── Get One ────────────────────────────────────────────────

export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await roleService.getById(id);
  return sendSuccess(res, data, 'Role fetched');
});

// ─── Create ─────────────────────────────────────────────────

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const createdBy = req.user!.userId;
  const data = await roleService.create({ ...req.body, createdBy });
  return sendSuccess(res, data, 'Role created', 201);
});

// ─── Update ─────────────────────────────────────────────────

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedBy = req.user!.userId;
  const data = await roleService.update(id, { ...req.body, updatedBy });
  return sendSuccess(res, data, 'Role updated');
});

// ─── Delete ─────────────────────────────────────────────────

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await roleService.delete(id);
  return sendSuccess(res, data, 'Role deleted');
});

// ─── Restore ────────────────────────────────────────────────

export const restoreRole = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const restorePermissions = req.body.restorePermissions === true;
  const data = await roleService.restore(id, restorePermissions);
  return sendSuccess(res, data, 'Role restored');
});
