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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu items retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       code: { type: string }
 *                       route: { type: string }
 *                       icon: { type: string, nullable: true }
 *                       description: { type: string, nullable: true }
 *                       parentMenuItemId: { type: integer, nullable: true }
 *                       permissionId: { type: integer, nullable: true }
 *                       displayOrder: { type: integer }
 *                       isVisible: { type: boolean }
 *                       isActive: { type: boolean }
 *                       children: { type: array }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
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
 *         description: Paginated menu item list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu items retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       code: { type: string }
 *                       route: { type: string }
 *                       icon: { type: string, nullable: true }
 *                       description: { type: string, nullable: true }
 *                       parentMenuItemId: { type: integer, nullable: true }
 *                       permissionId: { type: integer, nullable: true }
 *                       displayOrder: { type: integer }
 *                       isVisible: { type: boolean }
 *                       isActive: { type: boolean }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 50 }
 *                     totalCount: { type: integer }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (menu.read required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu item retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     route: { type: string }
 *                     icon: { type: string, nullable: true }
 *                     description: { type: string, nullable: true }
 *                     parentMenuItemId: { type: integer, nullable: true }
 *                     permissionId: { type: integer, nullable: true }
 *                     displayOrder: { type: integer }
 *                     isVisible: { type: boolean }
 *                     isActive: { type: boolean }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (menu.read required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Menu item not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Menu item not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu item created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     route: { type: string }
 *                     icon: { type: string, nullable: true }
 *                     description: { type: string, nullable: true }
 *                     parentMenuItemId: { type: integer, nullable: true }
 *                     permissionId: { type: integer, nullable: true }
 *                     displayOrder: { type: integer }
 *                     isVisible: { type: boolean }
 *                     isActive: { type: boolean }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (menu.create required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       409:
 *         description: Menu item code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Menu item code already exists" }
 *                 code: { type: string, example: "CONFLICT" }
 *                 details: { type: 'null' }
 */
menuItemRoutes.post('/', authMiddleware, authorize('menu.create'), validate(createMenuItemDto), createMenuItem);

// ─── Admin: Update menu item ──────────────────────────────
/**
 * @swagger
 * /api/v1/menu-items/{id}:
 *   patch:
 *     tags: [Menu Items]
 *     summary: Update menu item
 *     description: Updates a menu item. Requires menu.update permission.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu item updated successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     route: { type: string }
 *                     icon: { type: string, nullable: true }
 *                     description: { type: string, nullable: true }
 *                     parentMenuItemId: { type: integer, nullable: true }
 *                     permissionId: { type: integer, nullable: true }
 *                     displayOrder: { type: integer }
 *                     isVisible: { type: boolean }
 *                     isActive: { type: boolean }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (menu.update required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Menu item not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Menu item not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
menuItemRoutes.patch('/:id', authMiddleware, authorize('menu.update'), validate(updateMenuItemDto), updateMenuItem);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu item deleted successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     deletedAt: { type: string, format: date-time, nullable: true }
 *                     deletedChildrenCount: { type: integer, description: "Number of child items cascaded" }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (menu.delete required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Menu item not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Menu item not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
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
 *         description: Menu item restored (with optional child restoration)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Menu item restored successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     route: { type: string }
 *                     icon: { type: string, nullable: true }
 *                     description: { type: string, nullable: true }
 *                     parentMenuItemId: { type: integer, nullable: true }
 *                     permissionId: { type: integer, nullable: true }
 *                     displayOrder: { type: integer }
 *                     isVisible: { type: boolean }
 *                     isActive: { type: boolean }
 *                     restoredChildrenCount: { type: integer }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (menu.restore required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Menu item not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Menu item not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
menuItemRoutes.patch('/:id/restore', authMiddleware, authorize('menu.restore'), validate(restoreMenuItemDto), restoreMenuItem);

export { menuItemRoutes };
