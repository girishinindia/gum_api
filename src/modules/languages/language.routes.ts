import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './language.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('language', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('language', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('language', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('language', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('language', 'soft_delete'), ctrl.softDelete);

export default r;
