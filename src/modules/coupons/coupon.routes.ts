import { Router } from 'express';
import * as ctrl from './coupon.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('coupon', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('coupon', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('coupon', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('coupon', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('coupon', 'soft_delete'), ctrl.softDelete);

export default r;
