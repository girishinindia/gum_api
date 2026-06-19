import { Router } from 'express';
import * as ctrl from './chatAttachment.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

/**
 * Phase 1 — chat attachments. Standalone list/get/upload/delete for files
 * attached to chat messages (mounted at /api/v1/chat-attachments). Inline
 * attach-on-send still works via POST /chat-messages with field `attachment`.
 */
const r = Router();

// Public read
r.get('/message/:messageId', ctrl.listByMessage);
r.get('/:id', ctrl.getById);

// Protected writes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('chat_message', 'create'), ctrl.attachmentUpload.single('attachment'), ctrl.create);
r.delete('/:id', requirePermission('chat_message', 'soft_delete'), ctrl.remove);

export default r;
