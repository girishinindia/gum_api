import { Router } from 'express';
import * as ctrl from './courseBatch.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('course_batch', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('course_batch', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('course_batch', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('course_batch', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('course_batch', 'soft_delete'), ctrl.softDelete);

export default r;
