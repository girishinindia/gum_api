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
rolePermissionRoutes.get('/me', authMiddleware, getMyPermissions);

// ─── Admin: list role-permission mappings ───────────────────
rolePermissionRoutes.get('/', authMiddleware, authorize('permission.manage'), validate(listRolePermissionsDto), listRolePermissions);

// ─── Admin: get all permissions for a specific user ─────────
rolePermissionRoutes.get('/user/:userId', authMiddleware, authorize('permission.manage'), validate(userIdParamDto), getUserPermissions);

// ─── Admin: assign single permission ────────────────────────
rolePermissionRoutes.post('/assign', authMiddleware, authorize('permission.manage'), validate(assignPermissionDto), assignPermission);

// ─── Admin: bulk assign permissions ─────────────────────────
rolePermissionRoutes.post('/bulk-assign', authMiddleware, authorize('permission.manage'), validate(bulkAssignPermissionsDto), bulkAssignPermissions);

// ─── Admin: remove single permission ────────────────────────
rolePermissionRoutes.post('/remove', authMiddleware, authorize('permission.manage'), validate(removePermissionDto), removePermission);

// ─── Admin: remove all permissions from a role ──────────────
rolePermissionRoutes.delete('/role/:roleId', authMiddleware, authorize('permission.manage'), validate(bulkRemovePermissionsDto), bulkRemovePermissions);

// ─── Admin: replace all permissions for a role (atomic) ─────
rolePermissionRoutes.put('/replace', authMiddleware, authorize('permission.manage'), validate(replacePermissionsDto), replacePermissions);

export { rolePermissionRoutes };
