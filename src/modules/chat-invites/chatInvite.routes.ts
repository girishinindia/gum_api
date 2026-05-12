import { Router } from 'express';
import * as ctrl from './chatInvite.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public preview (no auth needed to see invite details)
r.get('/preview/:token', ctrl.previewInvite);

// Auth-only endpoints (any logged-in user)
r.post('/accept/:token', authMiddleware, ctrl.acceptInvite);
r.post('/join-by-code', authMiddleware, ctrl.joinByCode);

// Admin CRUD (RBAC protected)
r.use(authMiddleware, attachPermissions());
r.get('/', requirePermission('chat_invite', 'read'), ctrl.list);
r.get('/:id', requirePermission('chat_invite', 'read'), ctrl.getById);
r.post('/', requirePermission('chat_invite', 'create'), ctrl.create);
r.patch('/:id/revoke', requirePermission('chat_invite', 'update'), ctrl.revoke);
r.delete('/:id', requirePermission('chat_invite', 'delete'), ctrl.remove);

export default r;
