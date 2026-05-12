import { Router } from 'express';
import * as ctrl from './instructorEarning.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.get('/', ctrl.list);
r.get('/summary/:instructorId', ctrl.getSummary);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('instructor_earning', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('instructor_earning', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('instructor_earning', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('instructor_earning', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('instructor_earning', 'soft_delete'), ctrl.softDelete);

export default r;
