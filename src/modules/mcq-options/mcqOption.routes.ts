import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './mcqOption.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('mcq_option', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('mcq_option', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('mcq_option', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('mcq_option', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('mcq_option', 'soft_delete'), ctrl.softDelete);

export default r;
