import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './branch.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('branch', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('branch', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('branch', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('branch', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('branch', 'soft_delete'), ctrl.softDelete);

export default r;
