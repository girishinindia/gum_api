import { Router } from 'express';
import * as ctrl from './referralReward.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.post('/', requirePermission('referral_reward', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('referral_reward', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('referral_reward', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('referral_reward', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('referral_reward', 'soft_delete'), ctrl.softDelete);

export default r;
