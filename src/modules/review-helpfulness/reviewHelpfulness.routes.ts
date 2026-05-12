import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './reviewHelpfulness.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/',       requirePermission('review_helpfulness', 'read'),   ctrl.list);
r.get('/:id',   requirePermission('review_helpfulness', 'read'),   ctrl.getById);
r.post('/',      requirePermission('review_helpfulness', 'create'), ctrl.vote);
r.delete('/:id', requirePermission('review_helpfulness', 'delete'), ctrl.deleteVote);

export default r;
