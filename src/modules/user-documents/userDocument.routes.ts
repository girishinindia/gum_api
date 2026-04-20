import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './userDocument.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self
r.get('/me',                                       ctrl.listMy);
r.get('/me/:id',                                   ctrl.getMyById);
r.post('/me', upload.single('file'),               ctrl.createMy);
r.patch('/me/:id', upload.single('file'),           ctrl.updateMy);
r.delete('/me/:id',                                ctrl.softDeleteMy);
r.patch('/me/:id/restore',                          ctrl.restoreMy);
r.delete('/me/:id/permanent',                       ctrl.removeMy);

// Admin
r.get('/',                                          requirePermission('user_document', 'read'), ctrl.list);
r.get('/:id',                                       requirePermission('user_document', 'read'), ctrl.getById);
r.post('/', upload.single('file'),                  requirePermission('user_document', 'create'), ctrl.create);
r.patch('/:id', upload.single('file'),              requirePermission('user_document', 'update'), ctrl.update);
r.delete('/:id',                                    requirePermission('user_document', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore',                             requirePermission('user_document', 'restore'), ctrl.restore);
r.delete('/:id/permanent',                          requirePermission('user_document', 'delete'), ctrl.remove);

export default r;
