import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './user.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self
r.get('/me',   ctrl.getMe);
r.patch('/me', upload.single('avatar'), ctrl.updateMe);

// Admin: User management
r.get('/',     requirePermission('user', 'read'), ctrl.list);
r.get('/:id',  requirePermission('user', 'read'), ctrl.getById);
r.patch('/:id', requirePermission('user', 'update'), upload.single('avatar'), ctrl.update);

// Status (activate/deactivate)
r.patch('/:id/status', requirePermission('user', 'activate'), ctrl.updateStatus);

// Roles
r.post('/:id/roles',              requirePermission('user', 'manage_role'), ctrl.assignRole);
r.delete('/:id/roles/:roleId',    requirePermission('user', 'manage_role'), ctrl.revokeRole);

// Sessions
r.get('/:id/sessions',            requirePermission('session', 'read'), ctrl.getSessions);
r.post('/:id/revoke-sessions',    requirePermission('session', 'delete'), ctrl.revokeAllSessions);

export default r;
