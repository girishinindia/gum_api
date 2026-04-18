import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './state.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('state', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('state', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('state', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('state', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('state', 'soft_delete'), ctrl.softDelete);

export default r;
