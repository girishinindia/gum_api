import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './department.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('department', 'create'), ctrl.create);
r.patch('/:id',  requirePermission('department', 'update'), ctrl.update);
r.delete('/:id', requirePermission('department', 'delete'), ctrl.remove);

export default r;
