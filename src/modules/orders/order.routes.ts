import { Router } from 'express';
import * as ctrl from './order.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/:id/items', ctrl.getOrderItems);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('order', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('order', 'restore'), ctrl.restore);
r.patch('/:id/cancel', requirePermission('order', 'update'), ctrl.cancelOrder);
r.patch('/:id/confirm', requirePermission('order', 'approve'), ctrl.confirmOrder);
r.patch('/:id', requirePermission('order', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('order', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('order', 'soft_delete'), ctrl.softDelete);

export default r;
