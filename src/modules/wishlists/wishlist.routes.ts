import { Router } from 'express';
import * as ctrl from './wishlist.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/user/:userId', ctrl.getByUser);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/move-to-cart/:id', requirePermission('wishlist', 'create'), ctrl.moveToCart);
r.post('/', requirePermission('wishlist', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('wishlist', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('wishlist', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('wishlist', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('wishlist', 'soft_delete'), ctrl.softDelete);

export default r;
