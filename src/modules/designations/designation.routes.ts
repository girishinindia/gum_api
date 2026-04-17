import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './designation.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('designation', 'create'), ctrl.create);
r.patch('/:id',  requirePermission('designation', 'update'), ctrl.update);
r.delete('/:id', requirePermission('designation', 'delete'), ctrl.remove);

export default r;
