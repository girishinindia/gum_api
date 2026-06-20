import { Router } from 'express';
import * as ctrl from './chatRoom.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public read
r.get('/', ctrl.list);
// Current user's rooms (auth'd; declared before the public `/:id` matcher)
r.get('/mine', authMiddleware, ctrl.listMine);
r.get('/:id', ctrl.getById);

// Protected writes
r.use(authMiddleware, attachPermissions());
// 1:1 DM — any authenticated user (no chat_room:create permission needed)
r.post('/direct', ctrl.createOrGetDirect);
// Member self-leave (group only, non-owner). Auth required; no admin permission.
r.post('/:id/leave', ctrl.leaveRoom);
r.post('/batch-room', requirePermission('chat_room', 'create'), ctrl.createBatchRoom);
r.post('/:id/sync-batch', requirePermission('chat_room', 'update'), ctrl.syncBatchMembers);
r.post('/', requirePermission('chat_room', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('chat_room', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('chat_room', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('chat_room', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('chat_room', 'soft_delete'), ctrl.softDelete);

export default r;
