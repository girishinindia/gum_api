import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './bundleCourse.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('bundle_course', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('bundle_course', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('bundle_course', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('bundle_course', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('bundle_course', 'soft_delete'), ctrl.softDelete);

export default r;
