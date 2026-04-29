import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './courseSubCategory.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('course_sub_category', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('course_sub_category', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course_sub_category', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('course_sub_category', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course_sub_category', 'soft_delete'), ctrl.softDelete);

export default r;
