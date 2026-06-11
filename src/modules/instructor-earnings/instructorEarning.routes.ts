import { Router } from 'express';
import * as ctrl from './instructorEarning.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Self-service (the signed-in instructor's own earnings). Before /:id.
r.get('/me/summary', ctrl.summaryMine);
r.get('/me', ctrl.listMine);

// Admin reads — permission-guarded (were open to any signed-in user).
r.get('/', requirePermission('instructor_earning', 'read'), ctrl.list);
r.get('/summary/:instructorId', requirePermission('instructor_earning', 'read'), ctrl.getSummary);
r.get('/:id', requirePermission('instructor_earning', 'read'), ctrl.getById);
r.post('/', requirePermission('instructor_earning', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('instructor_earning', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('instructor_earning', 'update'), ctrl.update);
r.delete('/:id', requirePermission('instructor_earning', 'soft_delete'), ctrl.softDelete);

export default r;
