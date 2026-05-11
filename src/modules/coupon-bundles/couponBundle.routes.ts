import { Router } from 'express';
import * as ctrl from './couponBundle.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('coupon_bundle', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('coupon_bundle', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('coupon_bundle', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('coupon_bundle', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('coupon_bundle', 'soft_delete'), ctrl.softDelete);
export default r;
