import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './userBadge.controller';

const r = Router();

// All routes are protected
r.use(authMiddleware, attachPermissions());

// Self — any authenticated user can list their own badges
r.get('/me', ctrl.listMy);

r.get('/',    requirePermission('user_badge', 'read'), ctrl.list);
r.get('/:id', requirePermission('user_badge', 'read'), ctrl.getById);

// Get all badges for a specific user
r.get('/user/:userId', requirePermission('user_badge', 'read'), ctrl.getUserBadges);

// Award badge
r.post('/award',      requirePermission('user_badge', 'create'), ctrl.award);
r.post('/bulk-award', requirePermission('user_badge', 'create'), ctrl.bulkAward);

// Edit an award (doc 24 fix — June 2026)
r.patch('/:id',       requirePermission('user_badge', 'update'), ctrl.update);

// Remove badge from user
r.delete('/:id', requirePermission('user_badge', 'delete'), ctrl.removeBadge);

export default r;
