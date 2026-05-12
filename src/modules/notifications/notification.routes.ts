import { Router } from 'express';
import * as ctrl from './notification.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/unread-count/:userId', ctrl.getUnreadCount);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.patch('/mark-all-read', requirePermission('notification', 'update'), ctrl.markAllAsRead);
r.post('/', requirePermission('notification', 'create'), ctrl.create);
r.patch('/:id/read', requirePermission('notification', 'update'), ctrl.markAsRead);
r.patch('/:id/restore', requirePermission('notification', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('notification', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('notification', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('notification', 'soft_delete'), ctrl.softDelete);

export default r;
