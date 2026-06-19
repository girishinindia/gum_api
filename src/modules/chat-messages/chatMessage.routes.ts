import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './chatMessage.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { chatSendLimiter } from '../../middleware/rateLimiter';

const r = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB cap
});

// Public read (room messages)
r.get('/room/:roomId/pinned', ctrl.listPinned);
r.get('/room/:roomId', ctrl.listByRoom);
r.get('/:id/thread', ctrl.getThread);
r.get('/:id', ctrl.getById);
r.get('/', ctrl.list);

// Protected writes
r.use(authMiddleware, attachPermissions());
// Member send (text or attachment) to a room you belong to — no admin RBAC, spoof-safe
r.post('/room/:roomId', chatSendLimiter, upload.single('attachment'), ctrl.createInRoom);
r.post('/', requirePermission('chat_message', 'create'), chatSendLimiter, upload.single('attachment'), ctrl.create);
r.patch('/:id/pin', requirePermission('chat_message', 'update'), ctrl.togglePin);
r.patch('/:id', requirePermission('chat_message', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('chat_message', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('chat_message', 'soft_delete'), ctrl.softDelete);

export default r;
