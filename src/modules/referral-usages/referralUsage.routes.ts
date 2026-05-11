import { Router } from 'express';
import * as ctrl from './referralUsage.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('referral_usage', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('referral_usage', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('referral_usage', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('referral_usage', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('referral_usage', 'soft_delete'), ctrl.softDelete);

export default r;
