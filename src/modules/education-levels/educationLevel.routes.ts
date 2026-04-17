import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './educationLevel.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('education_level', 'create'), ctrl.create);
r.patch('/:id',  requirePermission('education_level', 'update'), ctrl.update);
r.delete('/:id', requirePermission('education_level', 'delete'), ctrl.remove);

export default r;
