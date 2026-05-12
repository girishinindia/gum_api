import { Router } from 'express';
import * as ctrl from './transaction.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/order/:orderId', ctrl.getByOrder);
r.get('/user/:userId', ctrl.getByUser);
r.get('/:id', ctrl.getById);
r.post('/', requirePermission('transaction', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('transaction', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('transaction', 'update'), ctrl.update);
r.delete('/:id', requirePermission('transaction', 'soft_delete'), ctrl.softDelete);

export default r;
