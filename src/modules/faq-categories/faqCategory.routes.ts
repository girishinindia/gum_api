import { Router } from 'express';
import * as ctrl from './faqCategory.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('faq_category', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('faq_category', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('faq_category', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('faq_category', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('faq_category', 'soft_delete'), ctrl.softDelete);

export default r;
