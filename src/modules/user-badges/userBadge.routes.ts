import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './userBadge.controller';

const r = Router();

// All routes are protected
r.use(authMiddleware, attachPermissions());

r.get('/',    requirePermission('user_badge', 'read'), ctrl.list);
r.get('/:id', requirePermission('user_badge', 'read'), ctrl.getById);

// Get all badges for a specific user
r.get('/user/:userId', requirePermission('user_badge', 'read'), ctrl.getUserBadges);

// Award badge
r.post('/award',      requirePermission('user_badge', 'create'), ctrl.award);
r.post('/bulk-award', requirePermission('user_badge', 'create'), ctrl.bulkAward);

// Remove badge from user
r.delete('/:id', requirePermission('user_badge', 'delete'), ctrl.removeBadge);

export default r;
