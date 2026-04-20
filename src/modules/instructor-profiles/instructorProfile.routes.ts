import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './instructorProfile.controller';

const r = Router();

r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.get('/user/:userId', requirePermission('instructor_profile', 'read'), ctrl.getByUserId);
r.put('/user/:userId', requirePermission('instructor_profile', 'update'), ctrl.upsertByUserId);
r.post('/', requirePermission('instructor_profile', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('instructor_profile', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('instructor_profile', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('instructor_profile', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('instructor_profile', 'soft_delete'), ctrl.softDelete);

export default r;
