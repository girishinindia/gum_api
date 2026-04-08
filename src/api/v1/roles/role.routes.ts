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

roleRoutes.get('/', authMiddleware, authorize('role.read'), validate(listRolesDto), listRoles);
roleRoutes.get('/:id', authMiddleware, authorize('role.read'), validate(roleIdParamDto), getRoleById);
roleRoutes.post('/', authMiddleware, authorize('role.create'), validate(createRoleDto), createRole);
roleRoutes.put('/:id', authMiddleware, authorize('role.update'), validate(updateRoleDto), updateRole);
roleRoutes.delete('/:id', authMiddleware, authorize('role.delete'), validate(roleIdParamDto), deleteRole);
roleRoutes.patch('/:id/restore', authMiddleware, authorize('role.restore'), validate(restoreRoleDto), restoreRole);

export { roleRoutes };
