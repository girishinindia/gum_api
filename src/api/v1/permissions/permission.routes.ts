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

permissionRoutes.get('/', authMiddleware, authorize('permission.manage'), validate(listPermissionsDto), listPermissions);
permissionRoutes.get('/:id', authMiddleware, authorize('permission.manage'), validate(permissionIdParamDto), getPermissionById);
permissionRoutes.post('/', authMiddleware, authorize('permission.manage'), validate(createPermissionDto), createPermission);
permissionRoutes.put('/:id', authMiddleware, authorize('permission.manage'), validate(updatePermissionDto), updatePermission);
permissionRoutes.delete('/:id', authMiddleware, authorize('permission.manage'), validate(permissionIdParamDto), deletePermission);
permissionRoutes.patch('/:id/restore', authMiddleware, authorize('permission.manage'), validate(permissionIdParamDto), restorePermission);

export { permissionRoutes };
