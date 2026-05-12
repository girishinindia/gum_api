import { Router } from 'express';
import * as ctrl from './invoice.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/order/:orderId', ctrl.getByOrder);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('invoice', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('invoice', 'restore'), ctrl.restore);
r.patch('/:id/issue', requirePermission('invoice', 'update'), ctrl.issueInvoice);
r.patch('/:id/cancel-invoice', requirePermission('invoice', 'update'), ctrl.cancelInvoice);
r.patch('/:id', requirePermission('invoice', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('invoice', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('invoice', 'soft_delete'), ctrl.softDelete);

export default r;
