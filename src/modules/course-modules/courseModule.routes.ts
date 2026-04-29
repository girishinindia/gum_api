import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './courseModule.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('course_module', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('course_module', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course_module', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('course_module', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course_module', 'soft_delete'), ctrl.softDelete);

export default r;
