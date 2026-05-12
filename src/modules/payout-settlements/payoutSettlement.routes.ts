import { Router } from 'express';
import * as ctrl from './payoutSettlement.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('payout_settlement', 'create'), ctrl.create);
r.patch('/:id/complete', requirePermission('payout_settlement', 'update'), ctrl.markCompleted);
r.patch('/:id/fail', requirePermission('payout_settlement', 'update'), ctrl.markFailed);
r.patch('/:id/restore', requirePermission('payout_settlement', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('payout_settlement', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('payout_settlement', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('payout_settlement', 'soft_delete'), ctrl.softDelete);

export default r;
