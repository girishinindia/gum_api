import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { moduleService } from '../../../modules/modules/module.service';

export const listModules = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    isActive: req.query.isActive != null ? req.query.isActive === 'true' : undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await moduleService.list(query);
  return sendSuccess(res, data, 'Modules fetched');
});

export const getModuleById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await moduleService.getById(id);
  return sendSuccess(res, data, 'Module fetched');
});

export const createModule = asyncHandler(async (req: Request, res: Response) => {
  const createdBy = req.user!.userId;
  const data = await moduleService.create({ ...req.body, createdBy });
  return sendSuccess(res, data, 'Module created', 201);
});

export const updateModule = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedBy = req.user!.userId;
  const data = await moduleService.update(id, { ...req.body, updatedBy });
  return sendSuccess(res, data, 'Module updated');
});

export const deleteModule = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await moduleService.delete(id);
  return sendSuccess(res, data, 'Module deleted');
});

export const restoreModule = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await moduleService.restore(id);
  return sendSuccess(res, data, 'Module restored');
});
