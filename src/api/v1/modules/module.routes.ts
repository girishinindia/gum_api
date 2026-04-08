import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listModules,
  getModuleById,
  createModule,
  updateModule,
  deleteModule,
  restoreModule
} from './module.controller';
import {
  listModulesDto,
  createModuleDto,
  updateModuleDto,
  moduleIdParamDto
} from './module.dto';

const moduleRoutes = Router();

/**
 * @swagger
 * /api/v1/modules:
 *   get:
 *     tags: [Modules]
 *     summary: List modules
 *     description: Returns paginated list of modules. Requires module.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
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
 *         description: Paginated module list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Modules retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       code: { type: string }
 *                       description: { type: string }
 *                       isActive: { type: boolean }
 *                       displayOrder: { type: integer }
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
 *         description: Insufficient permissions (requires module.read)
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
moduleRoutes.get('/', authMiddleware, authorize('module.read'), validate(listModulesDto), listModules);
/**
 * @swagger
 * /api/v1/modules/{id}:
 *   get:
 *     tags: [Modules]
 *     summary: Get module by ID
 *     description: Returns a single module. Requires module.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Module found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Module retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     description: { type: string }
 *                     isActive: { type: boolean }
 *                     displayOrder: { type: integer }
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
 *         description: Insufficient permissions (requires module.read)
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
 *         description: Module not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Module not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: "null" }
 */
moduleRoutes.get('/:id', authMiddleware, authorize('module.read'), validate(moduleIdParamDto), getModuleById);
/**
 * @swagger
 * /api/v1/modules:
 *   post:
 *     tags: [Modules]
 *     summary: Create module
 *     description: Creates a new module. Requires module.create permission.
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
 *               name: { type: string, example: "User Management" }
 *               code: { type: string, pattern: "^[a-z0-9_]+$", example: "user_management" }
 *               description: { type: string }
 *               displayOrder: { type: integer }
 *               icon: { type: string }
 *               color: { type: string }
 *     responses:
 *       201:
 *         description: Module created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Module created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     description: { type: string }
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
 *         description: Insufficient permissions (requires module.create)
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
 *         description: Module code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Module code already exists" }
 *                 code: { type: string, example: "CONFLICT" }
 *                 details: { type: "null" }
 */
moduleRoutes.post('/', authMiddleware, authorize('module.create'), validate(createModuleDto), createModule);
/**
 * @swagger
 * /api/v1/modules/{id}:
 *   patch:
 *     tags: [Modules]
 *     summary: Update module
 *     description: Updates module details. Requires module.update permission.
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
 *               description: { type: string }
 *               displayOrder: { type: integer }
 *               icon: { type: string }
 *               color: { type: string }
 *     responses:
 *       200:
 *         description: Module updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Module updated successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     code: { type: string }
 *                     description: { type: string }
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
 *         description: Insufficient permissions (requires module.update)
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
 *         description: Module not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Module not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: "null" }
 */
moduleRoutes.patch('/:id', authMiddleware, authorize('module.update'), validate(updateModuleDto), updateModule);
/**
 * @swagger
 * /api/v1/modules/{id}:
 *   delete:
 *     tags: [Modules]
 *     summary: Soft-delete module
 *     description: Soft-deletes a module. Requires module.delete permission (Super Admin only).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Module soft-deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Module deleted successfully" }
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
 *         description: Insufficient permissions (requires module.delete, Super Admin only)
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
 *         description: Module not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Module not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: "null" }
 */
moduleRoutes.delete('/:id', authMiddleware, authorize('module.delete'), validate(moduleIdParamDto), deleteModule);
/**
 * @swagger
 * /api/v1/modules/{id}/restore:
 *   patch:
 *     tags: [Modules]
 *     summary: Restore module
 *     description: Restores a soft-deleted module. Requires module.restore permission (Super Admin only).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Module restored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Module restored successfully" }
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
 *         description: Insufficient permissions (requires module.restore, Super Admin only)
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
 *         description: Module not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Module not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: "null" }
 */
moduleRoutes.patch('/:id/restore', authMiddleware, authorize('module.restore'), validate(moduleIdParamDto), restoreModule);

export { moduleRoutes };
