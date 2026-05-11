import { Router } from 'express';
import * as ctrl from './couponCourse.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('coupon_course', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('coupon_course', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('coupon_course', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('coupon_course', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('coupon_course', 'soft_delete'), ctrl.softDelete);
export default r;
