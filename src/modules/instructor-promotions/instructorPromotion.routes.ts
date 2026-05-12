import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './instructorPromotion.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('instructor_promotion', 'create'),      ctrl.create);
r.patch('/:id/approve',   requirePermission('instructor_promotion', 'approve'),     ctrl.approve);
r.patch('/:id/reject',    requirePermission('instructor_promotion', 'reject'),      ctrl.reject);
r.patch('/:id/restore',   requirePermission('instructor_promotion', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('instructor_promotion', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('instructor_promotion', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('instructor_promotion', 'soft_delete'), ctrl.softDelete);

export default r;
