import { Router } from 'express';
import * as ctrl from './payoutRequest.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.post('/', requirePermission('payout_request', 'create'), ctrl.create);
r.patch('/:id/approve', requirePermission('payout_request', 'approve'), ctrl.approve);
r.patch('/:id/reject', requirePermission('payout_request', 'reject'), ctrl.reject);
r.patch('/:id/restore', requirePermission('payout_request', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('payout_request', 'update'), ctrl.update);
r.delete('/:id', requirePermission('payout_request', 'soft_delete'), ctrl.softDelete);

export default r;
