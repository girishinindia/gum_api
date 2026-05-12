import { Router } from 'express';
import * as ctrl from './policyType.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('policy_type', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('policy_type', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('policy_type', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('policy_type', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('policy_type', 'soft_delete'), ctrl.softDelete);

export default r;
