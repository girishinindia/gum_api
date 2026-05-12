import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './chatMessage.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public read (room messages)
r.get('/room/:roomId/pinned', ctrl.listPinned);
r.get('/room/:roomId', ctrl.listByRoom);
r.get('/:id/thread', ctrl.getThread);
r.get('/:id', ctrl.getById);
r.get('/', ctrl.list);

// Protected writes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('chat_message', 'create'), upload.single('attachment'), ctrl.create);
r.patch('/:id/pin', requirePermission('chat_message', 'update'), ctrl.togglePin);
r.patch('/:id', requirePermission('chat_message', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('chat_message', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('chat_message', 'soft_delete'), ctrl.softDelete);

export default r;
