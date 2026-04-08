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
 *       403:
 *         description: Insufficient permissions
 */
roleRoutes.get('/', authMiddleware, authorize('role.read'), validate(listRolesDto), listRoles);
/**
 * @swagger
 * /api/v1/roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Get role by ID
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
 *       404:
 *         description: Role not found
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
 *       409:
 *         description: Role code already exists
 */
roleRoutes.post('/', authMiddleware, authorize('role.create'), validate(createRoleDto), createRole);
/**
 * @swagger
 * /api/v1/roles/{id}:
 *   put:
 *     tags: [Roles]
 *     summary: Update role
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
 *       404:
 *         description: Role not found
 */
roleRoutes.put('/:id', authMiddleware, authorize('role.update'), validate(updateRoleDto), updateRole);
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
 *       403:
 *         description: Cannot delete Super Admin role
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
 *       404:
 *         description: Role not found
 */
roleRoutes.patch('/:id/restore', authMiddleware, authorize('role.restore'), validate(restoreRoleDto), restoreRole);

export { roleRoutes };
