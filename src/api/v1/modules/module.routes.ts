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

moduleRoutes.get('/', authMiddleware, authorize('module.read'), validate(listModulesDto), listModules);
moduleRoutes.get('/:id', authMiddleware, authorize('module.read'), validate(moduleIdParamDto), getModuleById);
moduleRoutes.post('/', authMiddleware, authorize('module.create'), validate(createModuleDto), createModule);
moduleRoutes.put('/:id', authMiddleware, authorize('module.update'), validate(updateModuleDto), updateModule);
moduleRoutes.delete('/:id', authMiddleware, authorize('module.delete'), validate(moduleIdParamDto), deleteModule);
moduleRoutes.patch('/:id/restore', authMiddleware, authorize('module.restore'), validate(moduleIdParamDto), restoreModule);

export { moduleRoutes };
