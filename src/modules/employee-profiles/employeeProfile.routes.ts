import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './employeeProfile.controller';

const r = Router();

// Public
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.get('/user/:userId', requirePermission('employee_profile', 'read'), ctrl.getByUserId);
r.put('/user/:userId', requirePermission('employee_profile', 'update'), ctrl.upsertByUserId);
r.post('/', requirePermission('employee_profile', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('employee_profile', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('employee_profile', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('employee_profile', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('employee_profile', 'soft_delete'), ctrl.softDelete);

export default r;
