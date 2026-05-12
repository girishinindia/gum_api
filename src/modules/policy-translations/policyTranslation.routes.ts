import { Router } from 'express';
import * as ctrl from './policyTranslation.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes
r.get('/', ctrl.list);
r.get('/coverage', ctrl.coverage);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('policy_translation', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('policy_translation', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('policy_translation', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('policy_translation', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('policy_translation', 'soft_delete'), ctrl.softDelete);

export default r;
