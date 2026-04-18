import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requireSuperAdmin } from '../../middleware/rbac';
import * as ctrl from './role.controller';

const r = Router();
r.use(authMiddleware, attachPermissions(), requireSuperAdmin());

// Roles CRUD — super_admin only
r.get('/',                ctrl.list);
r.post('/',               ctrl.create);
r.patch('/:id/restore',   ctrl.restore);
r.get('/:id',             ctrl.getById);
r.patch('/:id',           ctrl.update);
r.delete('/:id/permanent', ctrl.remove);
r.delete('/:id',          ctrl.softDelete);

// Role-Permission management — super_admin only
r.get('/:id/permissions',                  ctrl.listPermissions);
r.post('/:id/permissions',                 ctrl.assignPermission);
r.post('/:id/permissions/bulk',            ctrl.assignBulkPermissions);
r.delete('/:id/permissions/:permissionId', ctrl.revokePermission);
r.delete('/:id/permissions',               ctrl.revokeAllPermissions);

export default r;
