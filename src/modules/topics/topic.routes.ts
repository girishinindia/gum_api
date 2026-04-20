import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './topic.controller';

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('topic', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('topic', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('topic', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('topic', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('topic', 'soft_delete'), ctrl.softDelete);
export default r;
