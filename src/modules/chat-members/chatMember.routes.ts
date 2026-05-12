import { Router } from 'express';
import * as ctrl from './chatMember.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// All routes require auth + RBAC
r.use(authMiddleware, attachPermissions());

r.get('/', requirePermission('chat_room_member', 'read'), ctrl.list);
r.get('/:id', requirePermission('chat_room_member', 'read'), ctrl.getById);
r.post('/bulk', requirePermission('chat_room_member', 'create'), ctrl.bulkAdd);
r.post('/', requirePermission('chat_room_member', 'create'), ctrl.create);
r.patch('/:id', requirePermission('chat_room_member', 'update'), ctrl.update);
r.delete('/:id', requirePermission('chat_room_member', 'delete'), ctrl.remove);

export default r;
