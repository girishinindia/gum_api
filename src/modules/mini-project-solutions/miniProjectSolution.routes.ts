import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './miniProjectSolution.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB for video

const r = Router();
r.get('/',         ctrl.list);
r.get('/:id',      ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',               requirePermission('mini_project_solution', 'create'),  upload.fields([{ name: 'video_file', maxCount: 1 }, { name: 'thumbnail_file', maxCount: 1 }]), ctrl.create);
r.post('/bulk-upload',    requirePermission('mini_project_solution', 'create'),  upload.array('video_files', 20), ctrl.bulkUpload);
r.patch('/:id/restore',   requirePermission('mini_project_solution', 'restore'),                              ctrl.restore);
r.patch('/:id',           requirePermission('mini_project_solution', 'update'),  upload.fields([{ name: 'video_file', maxCount: 1 }, { name: 'thumbnail_file', maxCount: 1 }]), ctrl.update);
r.delete('/:id/permanent', requirePermission('mini_project_solution', 'delete'),                              ctrl.remove);
r.delete('/:id',          requirePermission('mini_project_solution', 'soft_delete'),                          ctrl.softDelete);
export default r;
