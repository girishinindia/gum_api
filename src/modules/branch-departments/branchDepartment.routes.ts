import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './branchDepartment.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('branch_department', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('branch_department', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('branch_department', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('branch_department', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('branch_department', 'soft_delete'), ctrl.softDelete);

export default r;
