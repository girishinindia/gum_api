import { Router } from 'express';
import * as ctrl from './faqTranslation.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes
r.get('/', ctrl.list);
r.get('/coverage', ctrl.coverage);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('faq_translation', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('faq_translation', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('faq_translation', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('faq_translation', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('faq_translation', 'soft_delete'), ctrl.softDelete);

export default r;
