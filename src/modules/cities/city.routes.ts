import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './city.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('city', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('city', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('city', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('city', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('city', 'soft_delete'), ctrl.softDelete);

export default r;
