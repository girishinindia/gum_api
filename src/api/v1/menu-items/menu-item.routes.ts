import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listMenuItems,
  getMenuItem,
  getMyMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  restoreMenuItem
} from './menu-item.controller';
import {
  listMenuItemsDto,
  menuItemIdParamDto,
  createMenuItemDto,
  updateMenuItemDto,
  restoreMenuItemDto
} from './menu-item.dto';

const menuItemRoutes = Router();

// ─── User navigation (auth only, no RBAC) ──────────────────
menuItemRoutes.get('/me', authMiddleware, getMyMenu);

// ─── Admin: List menu items ────────────────────────────────
menuItemRoutes.get('/', authMiddleware, authorize('menu.read'), validate(listMenuItemsDto), listMenuItems);

// ─── Admin: Get single menu item ──────────────────────────
menuItemRoutes.get('/:id', authMiddleware, authorize('menu.read'), validate(menuItemIdParamDto), getMenuItem);

// ─── Admin: Create menu item ──────────────────────────────
menuItemRoutes.post('/', authMiddleware, authorize('menu.create'), validate(createMenuItemDto), createMenuItem);

// ─── Admin: Update menu item ──────────────────────────────
menuItemRoutes.put('/:id', authMiddleware, authorize('menu.update'), validate(updateMenuItemDto), updateMenuItem);

// ─── Admin: Delete menu item (cascades children) ──────────
menuItemRoutes.delete('/:id', authMiddleware, authorize('menu.delete'), validate(menuItemIdParamDto), deleteMenuItem);

// ─── Admin: Restore menu item ─────────────────────────────
menuItemRoutes.patch('/:id/restore', authMiddleware, authorize('menu.restore'), validate(restoreMenuItemDto), restoreMenuItem);

export { menuItemRoutes };
