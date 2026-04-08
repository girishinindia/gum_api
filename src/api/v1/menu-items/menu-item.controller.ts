import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { menuItemService } from '../../../modules/menu-items/menu-item.service';

// ─── List menu items (admin) ───────────────────────────────

export const listMenuItems = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    id: req.query.id ? Number(req.query.id) : undefined,
    code: req.query.code as string | undefined,
    filterParentId: req.query.parentId ? Number(req.query.parentId) : undefined,
    filterTopLevelOnly: req.query.topLevelOnly === 'true' ? true : undefined,
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await menuItemService.list(query);
  return sendSuccess(res, data, 'Menu items fetched');
});

// ─── Get single menu item ──────────────────────────────────

export const getMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await menuItemService.getById(id);
  return sendSuccess(res, data, 'Menu item fetched');
});

// ─── Get my navigation menu ────────────────────────────────

export const getMyMenu = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await menuItemService.getUserMenu(userId);
  return sendSuccess(res, data, 'User menu fetched');
});

// ─── Create menu item ──────────────────────────────────────

export const createMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const {
    name, code, route, icon, description,
    parentMenuId, permissionId, displayOrder,
    isVisible, isActive
  } = req.body;
  const createdBy = req.user!.userId;
  const data = await menuItemService.create({
    name, code, route, icon, description,
    parentMenuId, permissionId, displayOrder,
    isVisible, isActive, createdBy
  });
  return sendSuccess(res, data, 'Menu item created', 201);
});

// ─── Update menu item ──────────────────────────────────────

export const updateMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const {
    name, code, route, icon, description,
    parentMenuId, permissionId, displayOrder,
    isVisible, isActive
  } = req.body;
  const updatedBy = req.user!.userId;
  const data = await menuItemService.update(id, {
    name, code, route, icon, description,
    parentMenuId, permissionId, displayOrder,
    isVisible, isActive, updatedBy
  });
  return sendSuccess(res, data, 'Menu item updated');
});

// ─── Delete menu item (soft, cascades children) ────────────

export const deleteMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await menuItemService.delete(id);
  return sendSuccess(res, data, 'Menu item deleted');
});

// ─── Restore menu item ─────────────────────────────────────

export const restoreMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const restoreChildren = req.body.restoreChildren === true;
  const data = await menuItemService.restore(id, restoreChildren);
  return sendSuccess(res, data, 'Menu item restored');
});
