import { Router } from 'express';
import * as ctrl from './chatRoom.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public read
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected writes
r.use(authMiddleware, attachPermissions());
r.post('/batch-room', requirePermission('chat_room', 'create'), ctrl.createBatchRoom);
r.post('/:id/sync-batch', requirePermission('chat_room', 'update'), ctrl.syncBatchMembers);
r.post('/', requirePermission('chat_room', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('chat_room', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('chat_room', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('chat_room', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('chat_room', 'soft_delete'), ctrl.softDelete);

export default r;
