import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listRolePermissions,
  assignPermission,
  bulkAssignPermissions,
  removePermission,
  bulkRemovePermissions,
  replacePermissions,
  getUserPermissions,
  getMyPermissions
} from './role-permission.controller';
import {
  listRolePermissionsDto,
  assignPermissionDto,
  bulkAssignPermissionsDto,
  removePermissionDto,
  bulkRemovePermissionsDto,
  replacePermissionsDto,
  userIdParamDto
} from './role-permission.dto';

const rolePermissionRoutes = Router();

// ─── Self: get own permissions ──────────────────────────────
/**
 * @swagger
 * /api/v1/role-permissions/me:
 *   get:
 *     tags: [Role Permissions]
 *     summary: Get my permissions
 *     description: Returns all permissions for the authenticated user based on their assigned roles.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's permissions
 */
rolePermissionRoutes.get('/me', authMiddleware, getMyPermissions);

// ─── Admin: list role-permission mappings ───────────────────
/**
 * @swagger
 * /api/v1/role-permissions:
 *   get:
 *     tags: [Role Permissions]
 *     summary: List role-permission mappings
 *     description: Returns paginated role-permission assignments. Requires permission.manage.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: roleId
 *         schema: { type: integer }
 *       - in: query
 *         name: roleCode
 *         schema: { type: string }
 *       - in: query
 *         name: permissionId
 *         schema: { type: integer }
 *       - in: query
 *         name: moduleId
 *         schema: { type: integer }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [global, own, assigned] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated role-permission list
 */
rolePermissionRoutes.get('/', authMiddleware, authorize('permission.manage'), validate(listRolePermissionsDto), listRolePermissions);

// ─── Admin: get all permissions for a specific user ─────────
/**
 * @swagger
 * /api/v1/role-permissions/user/{userId}:
 *   get:
 *     tags: [Role Permissions]
 *     summary: Get user's permissions
 *     description: Returns all permissions for a specific user. Requires permission.manage.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User's permissions
 */
rolePermissionRoutes.get('/user/:userId', authMiddleware, authorize('permission.manage'), validate(userIdParamDto), getUserPermissions);

// ─── Admin: assign single permission ────────────────────────
/**
 * @swagger
 * /api/v1/role-permissions/assign:
 *   post:
 *     tags: [Role Permissions]
 *     summary: Assign single permission to role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionId]
 *             properties:
 *               roleId: { type: integer }
 *               permissionId: { type: integer }
 *     responses:
 *       201:
 *         description: Permission assigned
 *       409:
 *         description: Already assigned
 */
rolePermissionRoutes.post('/assign', authMiddleware, authorize('permission.manage'), validate(assignPermissionDto), assignPermission);

// ─── Admin: bulk assign permissions ─────────────────────────
/**
 * @swagger
 * /api/v1/role-permissions/bulk-assign:
 *   post:
 *     tags: [Role Permissions]
 *     summary: Bulk assign permissions to role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionIds]
 *             properties:
 *               roleId: { type: integer }
 *               permissionIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Permissions assigned
 */
rolePermissionRoutes.post('/bulk-assign', authMiddleware, authorize('permission.manage'), validate(bulkAssignPermissionsDto), bulkAssignPermissions);

// ─── Admin: remove single permission ────────────────────────
/**
 * @swagger
 * /api/v1/role-permissions/remove:
 *   post:
 *     tags: [Role Permissions]
 *     summary: Remove single permission from role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionId]
 *             properties:
 *               roleId: { type: integer }
 *               permissionId: { type: integer }
 *     responses:
 *       200:
 *         description: Permission removed
 */
rolePermissionRoutes.post('/remove', authMiddleware, authorize('permission.manage'), validate(removePermissionDto), removePermission);

// ─── Admin: remove all permissions from a role ──────────────
/**
 * @swagger
 * /api/v1/role-permissions/role/{roleId}:
 *   delete:
 *     tags: [Role Permissions]
 *     summary: Remove all permissions from role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: All permissions removed from role
 */
rolePermissionRoutes.delete('/role/:roleId', authMiddleware, authorize('permission.manage'), validate(bulkRemovePermissionsDto), bulkRemovePermissions);

// ─── Admin: replace all permissions for a role (atomic) ─────
/**
 * @swagger
 * /api/v1/role-permissions/replace:
 *   put:
 *     tags: [Role Permissions]
 *     summary: Replace all permissions for role (atomic)
 *     description: Removes all existing permissions and assigns the new set atomically. Empty array clears all permissions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionIds]
 *             properties:
 *               roleId: { type: integer }
 *               permissionIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Permissions replaced
 */
rolePermissionRoutes.put('/replace', authMiddleware, authorize('permission.manage'), validate(replacePermissionsDto), replacePermissions);

export { rolePermissionRoutes };
