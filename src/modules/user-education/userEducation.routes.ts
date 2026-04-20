import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './userEducation.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self — any authenticated user can manage their own education
r.get('/me',                                          ctrl.listMyEducation);
r.get('/me/:id',                                      ctrl.getMyEducationById);
r.post('/me', upload.single('certificate'),            ctrl.createMyEducation);
r.patch('/me/:id', upload.single('certificate'),       ctrl.updateMyEducation);
r.delete('/me/:id',                                    ctrl.softDeleteMyEducation);
r.patch('/me/:id/restore',                             ctrl.restoreMyEducation);
r.delete('/me/:id/permanent',                          ctrl.removeMyEducation);

// Admin — manage any user's education (requires user_education permissions)
r.get('/',                                 requirePermission('user_education', 'read'), ctrl.list);
r.get('/:id',                              requirePermission('user_education', 'read'), ctrl.getById);
r.post('/', upload.single('certificate'),  requirePermission('user_education', 'create'), ctrl.create);
r.patch('/:id', upload.single('certificate'), requirePermission('user_education', 'update'), ctrl.update);
r.delete('/:id',                           requirePermission('user_education', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore',                    requirePermission('user_education', 'restore'), ctrl.restore);
r.delete('/:id/permanent',                 requirePermission('user_education', 'delete'), ctrl.remove);

export default r;
