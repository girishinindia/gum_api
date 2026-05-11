import { Router } from 'express';
import * as ctrl from './couponBatch.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('coupon_batch', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('coupon_batch', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('coupon_batch', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('coupon_batch', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('coupon_batch', 'soft_delete'), ctrl.softDelete);
export default r;
