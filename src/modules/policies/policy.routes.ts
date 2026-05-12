import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './policy.controller';

const r = Router();

// Public routes
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('policy', 'create'), ctrl.create);
r.patch('/:id/publish', requirePermission('policy', 'update'), ctrl.publish);
r.patch('/:id/archive', requirePermission('policy', 'update'), ctrl.archive);
r.patch('/:id/restore', requirePermission('policy', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('policy', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('policy', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('policy', 'soft_delete'), ctrl.softDelete);

export default r;
