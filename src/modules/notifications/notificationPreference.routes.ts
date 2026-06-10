import { Router } from 'express';
import * as ctrl from './notificationPreference.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// ── Self-serve — authenticated user, own preferences only (no admin perm). ──
r.get('/me',   authMiddleware, ctrl.listMine);
r.patch('/me', authMiddleware, ctrl.upsertMine);

// ── Admin (RBAC-gated). ──
r.use(authMiddleware, attachPermissions());

r.get('/summary', requirePermission('notification_preference', 'read'), ctrl.summary);
r.get('/', requirePermission('notification_preference', 'read'), ctrl.list);
r.get('/user/:userId', requirePermission('notification_preference', 'read'), ctrl.getByUser);
r.get('/:id', requirePermission('notification_preference', 'read'), ctrl.getById);
r.patch('/user/:userId/bulk', requirePermission('notification_preference', 'update'), ctrl.bulkUpdate);
r.patch('/:id', requirePermission('notification_preference', 'update'), ctrl.update);

export default r;
