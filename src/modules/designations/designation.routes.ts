import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './designation.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('designation', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('designation', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('designation', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('designation', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('designation', 'soft_delete'), ctrl.softDelete);

export default r;
