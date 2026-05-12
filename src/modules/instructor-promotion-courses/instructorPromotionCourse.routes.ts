import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './instructorPromotionCourse.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('instructor_promotion_course', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('instructor_promotion_course', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('instructor_promotion_course', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('instructor_promotion_course', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('instructor_promotion_course', 'soft_delete'), ctrl.softDelete);

export default r;
