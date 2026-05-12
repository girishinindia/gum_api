import { Router } from 'express';
import * as walletCtrl from './wallet.controller';
import * as txnCtrl from './walletTransaction.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

// ── Wallet CRUD ──
r.get('/', requirePermission('wallet', 'read'), walletCtrl.list);
r.get('/:id', requirePermission('wallet', 'read'), walletCtrl.getById);
r.get('/user/:userId', requirePermission('wallet', 'read'), walletCtrl.getByUserId);

r.post('/', requirePermission('wallet', 'create'), walletCtrl.create);
r.post('/:id/freeze', requirePermission('wallet', 'activate'), walletCtrl.toggleFreeze);
r.post('/:id/credit', requirePermission('wallet', 'update'), walletCtrl.manualCredit);
r.post('/:id/debit', requirePermission('wallet', 'update'), walletCtrl.manualDebit);

r.patch('/:id/restore', requirePermission('wallet', 'restore'), walletCtrl.restore);
r.patch('/:id', requirePermission('wallet', 'update'), walletCtrl.update);

r.delete('/:id/permanent', requirePermission('wallet', 'delete'), walletCtrl.remove);
r.delete('/:id', requirePermission('wallet', 'soft_delete'), walletCtrl.softDelete);

export default r;
