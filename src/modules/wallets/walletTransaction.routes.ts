import { Router } from 'express';
import * as ctrl from './walletTransaction.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', requirePermission('wallet_transaction', 'read'), ctrl.list);
r.get('/:id', requirePermission('wallet_transaction', 'read'), ctrl.getById);

r.post('/:id/reverse', requirePermission('wallet_transaction', 'update'), ctrl.reverse);

r.patch('/:id/restore', requirePermission('wallet_transaction', 'restore'), ctrl.restore);

r.delete('/:id/permanent', requirePermission('wallet_transaction', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('wallet_transaction', 'soft_delete'), ctrl.softDelete);

export default r;
