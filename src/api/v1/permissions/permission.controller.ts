import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { permissionService } from '../../../modules/permissions/permission.service';

export const listPermissions = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    isActive: req.query.isActive != null ? req.query.isActive === 'true' : undefined,
    filterModuleId: req.query.moduleId ? Number(req.query.moduleId) : undefined,
    filterModuleCode: req.query.moduleCode as string | undefined,
    filterResource: req.query.resource as string | undefined,
    filterAction: req.query.action as string | undefined,
    filterScope: req.query.scope as string | undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await permissionService.list(query);
  return sendSuccess(res, data, 'Permissions fetched');
});

export const getPermissionById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await permissionService.getById(id);
  return sendSuccess(res, data, 'Permission fetched');
});

export const createPermission = asyncHandler(async (req: Request, res: Response) => {
  const createdBy = req.user!.userId;
  const data = await permissionService.create({ ...req.body, createdBy });
  return sendSuccess(res, data, 'Permission created', 201);
});

export const updatePermission = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedBy = req.user!.userId;
  const data = await permissionService.update(id, { ...req.body, updatedBy });
  return sendSuccess(res, data, 'Permission updated');
});

export const deletePermission = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await permissionService.delete(id);
  return sendSuccess(res, data, 'Permission deleted');
});

export const restorePermission = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await permissionService.restore(id);
  return sendSuccess(res, data, 'Permission restored');
});
