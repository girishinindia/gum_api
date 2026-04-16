import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './role.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

r.get('/',       requirePermission('role', 'read'), ctrl.list);
r.get('/:id',   requirePermission('role', 'read'), ctrl.getById);
r.post('/',      requirePermission('role', 'create'), ctrl.create);
r.patch('/:id', requirePermission('role', 'update'), ctrl.update);
r.delete('/:id', requirePermission('role', 'delete'), ctrl.remove);
r.patch('/:id/toggle-active', requirePermission('role', 'activate'), ctrl.toggleActive);

// Role-Permission management
r.get('/:id/permissions',                  requirePermission('role', 'update'), ctrl.listPermissions);
r.post('/:id/permissions',                 requirePermission('role', 'update'), ctrl.assignPermission);
r.post('/:id/permissions/bulk',            requirePermission('role', 'update'), ctrl.assignBulkPermissions);
r.delete('/:id/permissions/:permissionId', requirePermission('role', 'update'), ctrl.revokePermission);
r.delete('/:id/permissions',               requirePermission('role', 'update'), ctrl.revokeAllPermissions);

export default r;
