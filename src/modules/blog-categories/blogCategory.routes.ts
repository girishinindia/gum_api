import { Router } from 'express';
import * as ctrl from './blogCategory.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('blog_category', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('blog_category', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('blog_category', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('blog_category', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('blog_category', 'soft_delete'), ctrl.softDelete);

export default r;
