import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './subject.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('subject', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('subject', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('subject', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('subject', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('subject', 'soft_delete'), ctrl.softDelete);

export default r;
