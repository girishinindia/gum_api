import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './courseChapter.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('course_chapter', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('course_chapter', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course_chapter', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('course_chapter', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course_chapter', 'soft_delete'), ctrl.softDelete);

export default r;
