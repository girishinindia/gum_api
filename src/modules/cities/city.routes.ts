import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './city.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('city', 'create'), ctrl.create);
r.patch('/:id',  requirePermission('city', 'update'), ctrl.update);
r.delete('/:id', requirePermission('city', 'delete'), ctrl.remove);

export default r;
