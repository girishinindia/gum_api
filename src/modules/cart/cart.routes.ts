import { Router } from 'express';
import * as ctrl from './cart.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/user/:userId', ctrl.getByUser);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('cart_item', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('cart_item', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('cart_item', 'update'), ctrl.update);
r.delete('/clear/:userId', requirePermission('cart_item', 'delete'), ctrl.clearCart);
r.delete('/:id/permanent', requirePermission('cart_item', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('cart_item', 'soft_delete'), ctrl.softDelete);

export default r;
