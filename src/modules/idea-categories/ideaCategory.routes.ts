import { Router } from 'express';
import * as ctrl from './ideaCategory.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public (read-only) — used by the submit form + showcase filters
r.get('/', ctrl.list);

// Admin management
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('idea_category', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('idea_category', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('idea_category', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('idea_category', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('idea_category', 'soft_delete'), ctrl.softDelete);

export default r;
