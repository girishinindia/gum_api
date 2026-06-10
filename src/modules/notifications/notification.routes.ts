import { Router } from 'express';
import * as ctrl from './notification.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// ── Self-serve ("me") — any authenticated user, scoped to their own rows.
// Declared BEFORE the admin block + before '/:id' so "me" is never captured
// as an id and these routes don't require admin RBAC permissions. ──
r.get('/me',                 authMiddleware, ctrl.listMine);
r.get('/me/unread-count',    authMiddleware, ctrl.unreadCountMine);
r.patch('/me/read-all',      authMiddleware, ctrl.markAllMineRead);
r.patch('/me/:id/read',      authMiddleware, ctrl.markMineRead);
r.delete('/me/:id',          authMiddleware, ctrl.dismissMine);

// ── Admin / staff (RBAC-gated). These reads were previously PUBLIC — now
// gated like the writes (super-admin via bypass) to close the data leak. ──
r.use(authMiddleware, attachPermissions());
r.get('/',                   requirePermission('notification', 'read'),        ctrl.list);
r.get('/unread-count/:userId', requirePermission('notification', 'read'),      ctrl.getUnreadCount);
r.patch('/mark-all-read',    requirePermission('notification', 'update'),      ctrl.markAllAsRead);
r.post('/',                  requirePermission('notification', 'create'),      ctrl.create);
r.get('/:id',                requirePermission('notification', 'read'),        ctrl.getById);
r.patch('/:id/read',         requirePermission('notification', 'update'),      ctrl.markAsRead);
r.patch('/:id/restore',      requirePermission('notification', 'restore'),     ctrl.restore);
r.patch('/:id',              requirePermission('notification', 'update'),      ctrl.update);
r.delete('/:id/permanent',   requirePermission('notification', 'delete'),      ctrl.remove);
r.delete('/:id',             requirePermission('notification', 'soft_delete'), ctrl.softDelete);

export default r;
