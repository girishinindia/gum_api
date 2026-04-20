import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './userSocialMedia.controller';

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
r.get('/',                                 requirePermission('user_social_media', 'read'), ctrl.list);
r.get('/:id',                              requirePermission('user_social_media', 'read'), ctrl.getById);
r.post('/',                                requirePermission('user_social_media', 'create'), ctrl.create);
r.patch('/:id',                            requirePermission('user_social_media', 'update'), ctrl.update);
r.delete('/:id',                           requirePermission('user_social_media', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore',                    requirePermission('user_social_media', 'restore'), ctrl.restore);
r.delete('/:id/permanent',                 requirePermission('user_social_media', 'delete'), ctrl.remove);

export default r;
