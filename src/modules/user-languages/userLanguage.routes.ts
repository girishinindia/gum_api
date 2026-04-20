import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './userLanguage.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self
r.get('/me',              ctrl.listMy);
r.get('/me/:id',          ctrl.getMyById);
r.post('/me',             ctrl.createMy);
r.patch('/me/:id',        ctrl.updateMy);
r.delete('/me/:id',       ctrl.softDeleteMy);
r.patch('/me/:id/restore', ctrl.restoreMy);
r.delete('/me/:id/permanent', ctrl.removeMy);

// Admin
r.get('/',                                 requirePermission('user_language', 'read'), ctrl.list);
r.get('/:id',                              requirePermission('user_language', 'read'), ctrl.getById);
r.post('/',                                requirePermission('user_language', 'create'), ctrl.create);
r.patch('/:id',                            requirePermission('user_language', 'update'), ctrl.update);
r.delete('/:id',                           requirePermission('user_language', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore',                    requirePermission('user_language', 'restore'), ctrl.restore);
r.delete('/:id/permanent',                 requirePermission('user_language', 'delete'), ctrl.remove);

export default r;
