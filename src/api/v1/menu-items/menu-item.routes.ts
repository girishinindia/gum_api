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
/**
 * @swagger
 * /api/v1/menu-items/me:
 *   get:
 *     tags: [Menu Items]
 *     summary: Get my menu
 *     description: Returns menu items accessible to the authenticated user based on their role permissions.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's accessible menu items
 */
menuItemRoutes.get('/me', authMiddleware, getMyMenu);

// ─── Admin: List menu items ────────────────────────────────
/**
 * @swagger
 * /api/v1/menu-items:
 *   get:
 *     tags: [Menu Items]
 *     summary: List menu items
 *     description: Returns menu items with filtering. Requires menu.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *       - in: query
 *         name: parentMenuItemId
 *         schema: { type: integer }
 *       - in: query
 *         name: topLevelOnly
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: Only return items with no parent
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [display_order, name, code, created_at] }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [ASC, DESC] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Menu item list
 */
menuItemRoutes.get('/', authMiddleware, authorize('menu.read'), validate(listMenuItemsDto), listMenuItems);

// ─── Admin: Get single menu item ──────────────────────────
/**
 * @swagger
 * /api/v1/menu-items/{id}:
 *   get:
 *     tags: [Menu Items]
 *     summary: Get menu item by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Menu item found
 *       404:
 *         description: Menu item not found
 */
menuItemRoutes.get('/:id', authMiddleware, authorize('menu.read'), validate(menuItemIdParamDto), getMenuItem);

// ─── Admin: Create menu item ──────────────────────────────
/**
 * @swagger
 * /api/v1/menu-items:
 *   post:
 *     tags: [Menu Items]
 *     summary: Create menu item
 *     description: Creates a new menu item. Requires menu.create permission.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, route]
 *             properties:
 *               name: { type: string, example: "Dashboard" }
 *               code: { type: string, example: "dashboard" }
 *               route: { type: string, example: "/dashboard" }
 *               icon: { type: string }
 *               description: { type: string }
 *               parentMenuItemId: { type: integer }
 *               permissionId: { type: integer, description: "Permission required to see this menu item" }
 *               displayOrder: { type: integer }
 *               isVisible: { type: boolean, default: true }
 *               isActive: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Menu item created
 */
menuItemRoutes.post('/', authMiddleware, authorize('menu.create'), validate(createMenuItemDto), createMenuItem);

// ─── Admin: Update menu item ──────────────────────────────
/**
 * @swagger
 * /api/v1/menu-items/{id}:
 *   put:
 *     tags: [Menu Items]
 *     summary: Update menu item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               route: { type: string }
 *               icon: { type: string }
 *               description: { type: string }
 *               parentMenuItemId: { type: integer }
 *               permissionId: { type: integer }
 *               displayOrder: { type: integer }
 *               isVisible: { type: boolean }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Menu item updated
 */
menuItemRoutes.put('/:id', authMiddleware, authorize('menu.update'), validate(updateMenuItemDto), updateMenuItem);

// ─── Admin: Delete menu item (cascades children) ──────────
/**
 * @swagger
 * /api/v1/menu-items/{id}:
 *   delete:
 *     tags: [Menu Items]
 *     summary: Soft-delete menu item
 *     description: Soft-deletes a menu item and cascades to children. Requires menu.delete permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Menu item and children soft-deleted
 */
menuItemRoutes.delete('/:id', authMiddleware, authorize('menu.delete'), validate(menuItemIdParamDto), deleteMenuItem);

// ─── Admin: Restore menu item ─────────────────────────────
/**
 * @swagger
 * /api/v1/menu-items/{id}/restore:
 *   patch:
 *     tags: [Menu Items]
 *     summary: Restore menu item
 *     description: Restores a soft-deleted menu item with optional child restoration. Requires menu.restore permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               restoreChildren: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Menu item restored
 */
menuItemRoutes.patch('/:id/restore', authMiddleware, authorize('menu.restore'), validate(restoreMenuItemDto), restoreMenuItem);

export { menuItemRoutes };
