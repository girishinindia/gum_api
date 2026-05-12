import { Router } from 'express';
import * as ctrl from './referralCode.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.post('/', requirePermission('referral_code', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('referral_code', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('referral_code', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('referral_code', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('referral_code', 'soft_delete'), ctrl.softDelete);

export default r;
