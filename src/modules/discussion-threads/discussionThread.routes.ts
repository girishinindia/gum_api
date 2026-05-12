import { Router } from 'express';
import * as ctrl from './discussionThread.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('discussion_thread', 'create'), ctrl.create);
r.patch('/:id/close', requirePermission('discussion_thread', 'update'), ctrl.closeThread);
r.patch('/:id/resolve', requirePermission('discussion_thread', 'update'), ctrl.resolveThread);
r.patch('/:id/pin', requirePermission('discussion_thread', 'update'), ctrl.pinThread);
r.patch('/:id/restore', requirePermission('discussion_thread', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('discussion_thread', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('discussion_thread', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('discussion_thread', 'soft_delete'), ctrl.softDelete);

export default r;
