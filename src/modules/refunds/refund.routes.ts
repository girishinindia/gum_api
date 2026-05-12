import { Router } from 'express';
import * as ctrl from './refund.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/order/:orderId', ctrl.getByOrder);
r.get('/:id', ctrl.getById);
r.post('/', requirePermission('refund', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('refund', 'restore'), ctrl.restore);
r.patch('/:id/approve', requirePermission('refund', 'approve'), ctrl.approveRefund);
r.patch('/:id/reject', requirePermission('refund', 'reject'), ctrl.rejectRefund);
r.patch('/:id', requirePermission('refund', 'update'), ctrl.update);
r.delete('/:id', requirePermission('refund', 'soft_delete'), ctrl.softDelete);

export default r;
