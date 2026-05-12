import { Router } from 'express';
import * as ctrl from './sessionAttendance.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/mark', requirePermission('session_attendance', 'create'), ctrl.markAttendance);
r.post('/', requirePermission('session_attendance', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('session_attendance', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('session_attendance', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('session_attendance', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('session_attendance', 'soft_delete'), ctrl.softDelete);

export default r;
