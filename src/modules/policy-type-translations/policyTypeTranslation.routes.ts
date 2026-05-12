import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './policyTypeTranslation.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Coverage (before /:id to avoid conflict)
r.get('/coverage', requirePermission('policy_type_translation', 'read'), ctrl.coverage);

// CRUD
r.get('/', requirePermission('policy_type_translation', 'read'), ctrl.list);
r.get('/:id', requirePermission('policy_type_translation', 'read'), ctrl.getById);
r.post('/', requirePermission('policy_type_translation', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('policy_type_translation', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('policy_type_translation', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('policy_type_translation', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('policy_type_translation', 'soft_delete'), ctrl.softDelete);

export default r;
