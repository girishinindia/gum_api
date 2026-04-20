import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './subTopic.controller';

const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.get('/:id/video-status', ctrl.videoStatus);
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('sub_topic', 'create'),      ctrl.create);
r.post('/:id/upload-video', requirePermission('sub_topic', 'update'), videoUpload.single('video'), ctrl.uploadVideo);
r.patch('/:id/restore',   requirePermission('sub_topic', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('sub_topic', 'update'),      ctrl.update);
r.delete('/:id/video',    requirePermission('sub_topic', 'update'),      ctrl.deleteVideo);
r.delete('/:id/permanent', requirePermission('sub_topic', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('sub_topic', 'soft_delete'), ctrl.softDelete);
export default r;
