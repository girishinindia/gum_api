import { Router } from 'express';
import * as ctrl from './discussionReply.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('discussion_reply', 'create'), ctrl.create);
r.patch('/:id/accept', requirePermission('discussion_reply', 'update'), ctrl.acceptAnswer);
r.patch('/:id/restore', requirePermission('discussion_reply', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('discussion_reply', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('discussion_reply', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('discussion_reply', 'soft_delete'), ctrl.softDelete);

export default r;
