import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './courseModuleSubject.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('course_module_subject', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('course_module_subject', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course_module_subject', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('course_module_subject', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course_module_subject', 'soft_delete'), ctrl.softDelete);

export default r;
