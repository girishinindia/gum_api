import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  restoreRole
} from './role.controller';
import {
  listRolesDto,
  createRoleDto,
  updateRoleDto,
  roleIdParamDto,
  restoreRoleDto
} from './role.dto';

const roleRoutes = Router();

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     tags: [Roles]
 *     summary: List roles
 *     description: Returns paginated list of roles. Requires role.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: level
 *         schema: { type: integer }
 *       - in: query
 *         name: parentRoleId
 *         schema: { type: integer }
 *       - in: query
 *         name: isSystem
 *         schema: { type: string, enum: ["true", "false"] }
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
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated role list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Roles retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       code: { type: string }
 *                       description: { type: string }
 *                       level: { type: integer }
 *                       isActive: { type: boolean }
 *                       isSystem: { type: boolean }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     totalCount: { type: integer, example: 100 }
 *                     totalPages: { type: integer, example: 5 }
 *       400:
 *         description: Validation failed
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
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Authentication required" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: "null" }
 *       403:
 *         description: Insufficient permissions (requires role.read)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Insufficient permissions" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: "null" }
 */
roleRoutes.get('/', authMiddleware, authorize('role.read'), validate(listRolesDto), listRoles);
/**
 * @swagger
 * /api/v1/roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Get role by ID
 *     description: Returns a single role. Requires role.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Role found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Role retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     description: { type: string }
 *                     level: { type: integer }
 *                     isActive: { type: boolean }
 *                     isSystem: { type: boolean }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Authentication required" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: "null" }
 *       403:
 *         description: Insufficient permissions (requires role.read)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Insufficient permissions" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: "null" }
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
 *                 details: { type: "null" }
 */
roleRoutes.get('/:id', authMiddleware, authorize('role.read'), validate(roleIdParamDto), getRoleById);
/**
 * @swagger
 * /api/v1/roles:
 *   post:
 *     tags: [Roles]
 *     summary: Create role
 *     description: Creates a new role. Requires role.create permission.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name: { type: string, example: "Branch Manager" }
 *               code: { type: string, pattern: "^[a-z0-9_]+$", example: "branch_manager" }
 *               description: { type: string }
 *               parentRoleId: { type: integer }
 *               level: { type: integer, minimum: 0, maximum: 99, default: 50 }
 *               isSystem: { type: boolean, default: false }
 *               displayOrder: { type: integer }
 *               icon: { type: string }
 *               color: { type: string }
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Role created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     description: { type: string }
 *                     level: { type: integer }
 *                     isActive: { type: boolean }
 *       400:
 *         description: Validation failed
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
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Authentication required" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: "null" }
 *       403:
 *         description: Insufficient permissions (requires role.create)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Insufficient permissions" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: "null" }
 *       409:
 *         description: Role code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Role code already exists" }
 *                 code: { type: string, example: "CONFLICT" }
 *                 details: { type: "null" }
 */
roleRoutes.post('/', authMiddleware, authorize('role.create'), validate(createRoleDto), createRole);
/**
 * @swagger
 * /api/v1/roles/{id}:
 *   patch:
 *     tags: [Roles]
 *     summary: Update role
 *     description: Updates role details. Requires role.update permission.
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
 *               description: { type: string }
 *               parentRoleId: { type: integer }
 *               level: { type: integer }
 *               isSystem: { type: boolean }
 *               displayOrder: { type: integer }
 *               icon: { type: string }
 *               color: { type: string }
 *     responses:
 *       200:
 *         description: Role updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Role updated successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     description: { type: string }
 *                     level: { type: integer }
 *       400:
 *         description: Validation failed
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
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Authentication required" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: "null" }
 *       403:
 *         description: Insufficient permissions (requires role.update)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Insufficient permissions" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: "null" }
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
 *                 details: { type: "null" }
 */
roleRoutes.patch('/:id', authMiddleware, authorize('role.update'), validate(updateRoleDto), updateRole);
/**
 * @swagger
 * /api/v1/roles/{id}:
 *   delete:
 *     tags: [Roles]
 *     summary: Soft-delete role
 *     description: Soft-deletes a role. Requires role.delete permission (Super Admin only). Cannot delete the super_admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Role soft-deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Role deleted successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     isDeleted: { type: boolean, example: true }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Authentication required" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: "null" }
 *       403:
 *         description: Cannot delete Super Admin role or insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *                 code: { type: string, enum: ["FORBIDDEN", "CANNOT_DELETE_SUPER_ADMIN_ROLE"] }
 *                 details: { type: "null" }
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
 *                 details: { type: "null" }
 */
roleRoutes.delete('/:id', authMiddleware, authorize('role.delete'), validate(roleIdParamDto), deleteRole);
/**
 * @swagger
 * /api/v1/roles/{id}/restore:
 *   patch:
 *     tags: [Roles]
 *     summary: Restore role
 *     description: Restores a soft-deleted role with optional permission restoration. Requires role.restore permission (Super Admin only).
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
 *               restorePermissions: { type: boolean, default: false, description: "Also restore associated permissions" }
 *     responses:
 *       200:
 *         description: Role restored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Role restored successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     isDeleted: { type: boolean, example: false }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Authentication required" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: "null" }
 *       403:
 *         description: Insufficient permissions (requires role.restore, Super Admin only)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Insufficient permissions" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: "null" }
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
 *                 details: { type: "null" }
 */
roleRoutes.patch('/:id/restore', authMiddleware, authorize('role.restore'), validate(restoreRoleDto), restoreRole);

export { roleRoutes };
