import { Router } from 'express';
import * as ctrl from './webinar.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('webinar', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('webinar', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('webinar', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('webinar', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('webinar', 'soft_delete'), ctrl.softDelete);

export default r;
