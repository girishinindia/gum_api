import { Router } from 'express';
import * as ctrl from './emailTemplate.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/summary', requirePermission('email_template', 'read'), ctrl.summary);
r.get('/', requirePermission('email_template', 'read'), ctrl.list);
r.get('/:id', requirePermission('email_template', 'read'), ctrl.getById);
r.post('/', requirePermission('email_template', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('email_template', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('email_template', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('email_template', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('email_template', 'soft_delete'), ctrl.softDelete);

export default r;
