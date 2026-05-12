import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './blogReview.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Stats (before /:id to avoid conflict)
r.get('/stats', requirePermission('blog_review', 'read'), ctrl.stats);

// CRUD
r.get('/', requirePermission('blog_review', 'read'), ctrl.list);
r.get('/:id', requirePermission('blog_review', 'read'), ctrl.getById);
r.post('/', requirePermission('blog_review', 'create'), ctrl.create);
r.put('/:id', requirePermission('blog_review', 'update'), ctrl.update);

// Status change
r.patch('/:id/status', requirePermission('blog_review', 'update'), ctrl.changeStatus);

// Soft delete / restore
r.patch('/:id/soft-delete', requirePermission('blog_review', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore', requirePermission('blog_review', 'restore'), ctrl.restore);

// Permanent delete
r.delete('/:id', requirePermission('blog_review', 'delete'), ctrl.permanentDelete);

// Admin recalculate
r.post('/recalculate', requirePermission('blog_review', 'update'), ctrl.triggerRecalculate);

export default r;
