import { Router } from 'express';
import * as ctrl from './sessionRecording.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('session_recording', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('session_recording', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('session_recording', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('session_recording', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('session_recording', 'soft_delete'), ctrl.softDelete);

export default r;
