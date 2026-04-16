import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission, requireSuperAdmin } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './user.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self — all authenticated users
r.get('/me',                                    ctrl.getMe);
r.patch('/me', upload.single('avatar'),         ctrl.updateMe);
r.get('/me/permissions',                        ctrl.getMyPermissions);

// User management
r.get('/',                                      requirePermission('user', 'read'), ctrl.list);
r.post('/', upload.single('avatar'),            requireSuperAdmin(), ctrl.create);
r.get('/:id',                                   requirePermission('user', 'read'), ctrl.getById);
r.patch('/:id', upload.single('avatar'),        requirePermission('user', 'update'), ctrl.update);

// Role assignments — super_admin only
r.post('/:id/roles',                            requireSuperAdmin(), ctrl.assignRole);
r.delete('/:id/roles/:roleId',                  requireSuperAdmin(), ctrl.revokeRole);

// Sessions
r.get('/:id/sessions',                          requirePermission('session', 'read'), ctrl.getSessions);
r.post('/:id/revoke-sessions',                  requirePermission('session', 'delete'), ctrl.revokeAllSessions);

export default r;
