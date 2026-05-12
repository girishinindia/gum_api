import { Router } from 'express';
import * as ctrl from './payment.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/order/:orderId', ctrl.getByOrder);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('payment', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('payment', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('payment', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('payment', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('payment', 'soft_delete'), ctrl.softDelete);

export default r;
