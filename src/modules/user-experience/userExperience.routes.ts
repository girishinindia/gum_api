import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './userExperience.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self — any authenticated user can manage their own experience
r.get('/me',              ctrl.listMy);
r.get('/me/:id',          ctrl.getMyById);
r.post('/me',             ctrl.createMy);
r.patch('/me/:id',        ctrl.updateMy);
r.delete('/me/:id',       ctrl.softDeleteMy);
r.patch('/me/:id/restore', ctrl.restoreMy);
r.delete('/me/:id/permanent', ctrl.removeMy);

// Admin — manage any user's experience
r.get('/',                                 requirePermission('user_experience', 'read'), ctrl.list);
r.get('/:id',                              requirePermission('user_experience', 'read'), ctrl.getById);
r.post('/',                                requirePermission('user_experience', 'create'), ctrl.create);
r.patch('/:id',                            requirePermission('user_experience', 'update'), ctrl.update);
r.delete('/:id',                           requirePermission('user_experience', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore',                    requirePermission('user_experience', 'restore'), ctrl.restore);
r.delete('/:id/permanent',                 requirePermission('user_experience', 'delete'), ctrl.remove);

export default r;
