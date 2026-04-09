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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User permissions retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       code: { type: string }
 *                       name: { type: string }
 *                       resource: { type: string }
 *                       action: { type: string }
 *                       scope: { type: string }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Role permissions retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       roleId: { type: integer }
 *                       roleCode: { type: string }
 *                       roleName: { type: string }
 *                       permissionId: { type: integer }
 *                       permissionCode: { type: string }
 *                       permissionName: { type: string }
 *                       resource: { type: string }
 *                       action: { type: string }
 *                       scope: { type: string }
 *                       createdAt: { type: string, format: date-time }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User permissions retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       code: { type: string }
 *                       name: { type: string }
 *                       resource: { type: string }
 *                       action: { type: string }
 *                       scope: { type: string }
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "User not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
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
 *         description: Permission assigned to role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission assigned successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     roleId: { type: integer }
 *                     permissionId: { type: integer }
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
 *         description: |
 *           Forbidden. Possible reasons:
 *           - Missing permission.manage (code: FORBIDDEN)
 *           - Admin trying to modify admin/super_admin role permissions (code: ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Admins cannot modify permissions for Super Admin or Admin roles. Only Super Admin can do this." }
 *                 code: { type: string, example: "ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Role or permission not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Role or permission not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 *       409:
 *         description: Permission already assigned to role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "This permission is already assigned to the role." }
 *                 code: { type: string, example: "DUPLICATE_ENTRY" }
 *                 details: { type: 'null' }
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
 *         description: Permissions assigned (with count)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permissions assigned successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roleId: { type: integer }
 *                     assignedCount: { type: integer }
 *                     totalRequested: { type: integer }
 *                     skippedCount: { type: integer, description: "Already assigned permissions" }
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
 *         description: |
 *           Forbidden. Possible reasons:
 *           - Missing permission.manage (code: FORBIDDEN)
 *           - Admin trying to modify admin/super_admin role permissions (code: ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Admins cannot modify permissions for Super Admin or Admin roles. Only Super Admin can do this." }
 *                 code: { type: string, example: "ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS" }
 *                 details: { type: 'null' }
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
 *         description: Permission removed from role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permission removed successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roleId: { type: integer }
 *                     permissionId: { type: integer }
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
 *         description: |
 *           Forbidden. Possible reasons:
 *           - Missing permission.manage (code: FORBIDDEN)
 *           - Admin trying to modify admin/super_admin role permissions (code: ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Admins cannot modify permissions for Super Admin or Admin roles. Only Super Admin can do this." }
 *                 code: { type: string, example: "ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Role-permission mapping not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Role-permission mapping not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "All permissions removed from role" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roleId: { type: integer }
 *                     removedCount: { type: integer }
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
 *         description: |
 *           Forbidden. Possible reasons:
 *           - Missing permission.manage (code: FORBIDDEN)
 *           - Admin trying to modify admin/super_admin role permissions (code: ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Admins cannot modify permissions for Super Admin or Admin roles. Only Super Admin can do this." }
 *                 code: { type: string, example: "ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Role not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Role not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
rolePermissionRoutes.delete('/role/:roleId', authMiddleware, authorize('permission.manage'), validate(bulkRemovePermissionsDto), bulkRemovePermissions);

// ─── Admin: replace all permissions for a role (atomic) ─────
/**
 * @swagger
 * /api/v1/role-permissions/replace:
 *   patch:
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
 *         description: Permissions replaced atomically
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Permissions replaced successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roleId: { type: integer }
 *                     removedCount: { type: integer }
 *                     addedCount: { type: integer }
 *                     permissionIds: { type: array, items: { type: integer } }
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
 *         description: |
 *           Forbidden. Possible reasons:
 *           - Missing permission.manage (code: FORBIDDEN)
 *           - Admin trying to modify admin/super_admin role permissions (code: ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Admins cannot modify permissions for Super Admin or Admin roles. Only Super Admin can do this." }
 *                 code: { type: string, example: "ADMIN_CANNOT_MODIFY_ADMIN_PERMISSIONS" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Role or permission not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Role or permission not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
rolePermissionRoutes.patch('/replace', authMiddleware, authorize('permission.manage'), validate(replacePermissionsDto), replacePermissions);

export { rolePermissionRoutes };
