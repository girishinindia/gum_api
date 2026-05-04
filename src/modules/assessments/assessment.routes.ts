import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './assessment.controller';

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.get('/:id/full',        requirePermission('assessment', 'read'),        ctrl.getFullById);
r.post('/full',            requirePermission('assessment', 'create'),      ctrl.createFull);
r.post('/',                requirePermission('assessment', 'create'),      ctrl.create);
r.patch('/:id/full',      requirePermission('assessment', 'update'),      ctrl.updateFull);
r.patch('/:id/restore',   requirePermission('assessment', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('assessment', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('assessment', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('assessment', 'soft_delete'), ctrl.softDelete);
export default r;
