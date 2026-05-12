import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './badge.controller';

const r = Router();

// All routes are protected
r.use(authMiddleware, attachPermissions());

r.get('/',    requirePermission('badge', 'read'),   ctrl.list);
r.get('/:id', requirePermission('badge', 'read'),   ctrl.getById);

r.post('/', requirePermission('badge', 'create'), upload.single('icon'), ctrl.create);

r.patch('/:id/restore', requirePermission('badge', 'restore'), ctrl.restore);
r.patch('/:id',         requirePermission('badge', 'update'), upload.single('icon'), ctrl.update);

r.delete('/:id/permanent', requirePermission('badge', 'delete'),      ctrl.remove);
r.delete('/:id',           requirePermission('badge', 'soft_delete'), ctrl.softDelete);

export default r;
