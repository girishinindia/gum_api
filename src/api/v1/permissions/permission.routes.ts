import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listPermissions,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
  restorePermission
} from './permission.controller';
import {
  listPermissionsDto,
  createPermissionDto,
  updatePermissionDto,
  permissionIdParamDto
} from './permission.dto';

const permissionRoutes = Router();

/**
 * @swagger
 * /api/v1/permissions:
 *   get:
 *     tags: [Permissions]
 *     summary: List permissions
 *     description: Returns paginated list of permissions. Requires permission.manage.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: moduleId
 *         schema: { type: integer }
 *       - in: query
 *         name: resource
 *         schema: { type: string }
 *       - in: query
 *         name: action
 *         schema: { type: string, enum: [create, read, update, delete, approve, reject, publish, unpublish, export, import, assign, manage, restore, ban, unban, verify] }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [global, own, assigned] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [ASC, DESC] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated permission list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permissions retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       moduleId: { type: integer }
 *                       name: { type: string }
 *                       code: { type: string }
 *                       resource: { type: string }
 *                       action: { type: string }
 *                       scope: { type: string }
 *                       description: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
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
 *         description: Forbidden (permission.manage required)
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
permissionRoutes.get('/', authMiddleware, authorize('permission.manage'), validate(listPermissionsDto), listPermissions);
/**
 * @swagger
 * /api/v1/permissions/{id}:
 *   get:
 *     tags: [Permissions]
 *     summary: Get permission by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Permission found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     moduleId: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     resource: { type: string }
 *                     action: { type: string }
 *                     scope: { type: string }
 *                     description: { type: string, nullable: true }
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
 *         description: Forbidden (permission.manage required)
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
 *         description: Permission not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Permission not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
permissionRoutes.get('/:id', authMiddleware, authorize('permission.manage'), validate(permissionIdParamDto), getPermissionById);
/**
 * @swagger
 * /api/v1/permissions:
 *   post:
 *     tags: [Permissions]
 *     summary: Create permission
 *     description: Creates a new permission linked to a module. Auto-assigned to Super Admin (all) and Admin (non-delete/restore) via database trigger.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [moduleId, name, code, resource, action]
 *             properties:
 *               moduleId: { type: integer, example: 1 }
 *               name: { type: string, example: "Create User" }
 *               code: { type: string, example: "user.create" }
 *               resource: { type: string, example: "user" }
 *               action: { type: string, enum: [create, read, update, delete, approve, reject, publish, unpublish, export, import, assign, manage, restore, ban, unban, verify] }
 *               scope: { type: string, enum: [global, own, assigned], default: global }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Permission created (auto-assigned to SA and Admin via trigger)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     moduleId: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     resource: { type: string }
 *                     action: { type: string }
 *                     scope: { type: string }
 *                     description: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
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
 *         description: Forbidden (permission.manage required)
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
 *         description: Permission code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "A permission with this code already exists." }
 *                 code: { type: string, example: "DUPLICATE_ENTRY" }
 *                 details: { type: 'null' }
 */
permissionRoutes.post('/', authMiddleware, authorize('permission.manage'), validate(createPermissionDto), createPermission);
/**
 * @swagger
 * /api/v1/permissions/{id}:
 *   patch:
 *     tags: [Permissions]
 *     summary: Update permission
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
 *               moduleId: { type: integer }
 *               name: { type: string }
 *               code: { type: string }
 *               resource: { type: string }
 *               action: { type: string }
 *               scope: { type: string }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Permission updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission updated successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     moduleId: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     resource: { type: string }
 *                     action: { type: string }
 *                     scope: { type: string }
 *                     description: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
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
 *         description: Forbidden (permission.manage required)
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
 *         description: Permission not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Permission not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
permissionRoutes.patch('/:id', authMiddleware, authorize('permission.manage'), validate(updatePermissionDto), updatePermission);
/**
 * @swagger
 * /api/v1/permissions/{id}:
 *   delete:
 *     tags: [Permissions]
 *     summary: Soft-delete permission
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Permission soft-deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission deleted successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     moduleId: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     resource: { type: string }
 *                     action: { type: string }
 *                     scope: { type: string }
 *                     deletedAt: { type: string, format: date-time, nullable: true }
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
 *         description: Forbidden (permission.manage required)
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
 *         description: Permission not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Permission not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
permissionRoutes.delete('/:id', authMiddleware, authorize('permission.manage'), validate(permissionIdParamDto), deletePermission);
/**
 * @swagger
 * /api/v1/permissions/{id}/restore:
 *   patch:
 *     tags: [Permissions]
 *     summary: Restore permission
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Permission restored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission restored successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     moduleId: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     resource: { type: string }
 *                     action: { type: string }
 *                     scope: { type: string }
 *                     description: { type: string, nullable: true }
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
 *         description: Forbidden (permission.manage required)
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
 *         description: Permission not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Permission not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
permissionRoutes.patch('/:id/restore', authMiddleware, authorize('permission.manage'), validate(permissionIdParamDto), restorePermission);

export { permissionRoutes };
