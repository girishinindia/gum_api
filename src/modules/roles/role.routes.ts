import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requireSuperAdmin } from '../../middleware/rbac';
import * as ctrl from './role.controller';

const r = Router();
r.use(authMiddleware, attachPermissions(), requireSuperAdmin());

// Roles CRUD — super_admin only
r.get('/',       ctrl.list);
r.get('/:id',    ctrl.getById);
r.post('/',      ctrl.create);
r.patch('/:id',  ctrl.update);
r.delete('/:id', ctrl.remove);

// Role-Permission management — super_admin only
r.get('/:id/permissions',                  ctrl.listPermissions);
r.post('/:id/permissions',                 ctrl.assignPermission);
r.post('/:id/permissions/bulk',            ctrl.assignBulkPermissions);
r.delete('/:id/permissions/:permissionId', ctrl.revokePermission);
r.delete('/:id/permissions',               ctrl.revokeAllPermissions);

export default r;
