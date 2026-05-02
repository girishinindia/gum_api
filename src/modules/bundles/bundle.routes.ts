import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './bundle.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('bundle', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('bundle', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('bundle', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('bundle', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('bundle', 'soft_delete'), ctrl.softDelete);

export default r;
