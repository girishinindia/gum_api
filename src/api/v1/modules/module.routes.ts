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
 */
moduleRoutes.get('/', authMiddleware, authorize('module.read'), validate(listModulesDto), listModules);
/**
 * @swagger
 * /api/v1/modules/{id}:
 *   get:
 *     tags: [Modules]
 *     summary: Get module by ID
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
 *       404:
 *         description: Module not found
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
 *       409:
 *         description: Module code already exists
 */
moduleRoutes.post('/', authMiddleware, authorize('module.create'), validate(createModuleDto), createModule);
/**
 * @swagger
 * /api/v1/modules/{id}:
 *   put:
 *     tags: [Modules]
 *     summary: Update module
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
 *       404:
 *         description: Module not found
 */
moduleRoutes.put('/:id', authMiddleware, authorize('module.update'), validate(updateModuleDto), updateModule);
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
 *       404:
 *         description: Module not found
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
 *       404:
 *         description: Module not found
 */
moduleRoutes.patch('/:id/restore', authMiddleware, authorize('module.restore'), validate(moduleIdParamDto), restoreModule);

export { moduleRoutes };
