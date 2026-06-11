import { Router } from 'express';
import * as ctrl from './order.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Self-service (any signed-in user — own orders only). Before /:id.
r.get('/me', ctrl.listMine);
r.get('/me/:id', ctrl.getMine);

// Admin reads — these listed EVERY order to ANY signed-in user before
// June 2026; now properly permission-guarded.
r.get('/', requirePermission('order', 'read'), ctrl.list);
r.get('/:id/items', requirePermission('order', 'read'), ctrl.getOrderItems);
r.get('/:id', requirePermission('order', 'read'), ctrl.getById);
r.post('/', requirePermission('order', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('order', 'restore'), ctrl.restore);
r.patch('/:id/cancel', requirePermission('order', 'update'), ctrl.cancelOrder);
r.patch('/:id/confirm', requirePermission('order', 'approve'), ctrl.confirmOrder);
r.patch('/:id', requirePermission('order', 'update'), ctrl.update);
r.delete('/:id', requirePermission('order', 'soft_delete'), ctrl.softDelete);

export default r;
