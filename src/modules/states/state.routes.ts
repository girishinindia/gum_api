import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './state.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('state', 'create'), ctrl.create);
r.patch('/:id',  requirePermission('state', 'update'), ctrl.update);
r.delete('/:id', requirePermission('state', 'delete'), ctrl.remove);

export default r;
