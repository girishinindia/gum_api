import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './podcast.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Public routes (no auth — read-only) ──
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);
r.get('/:id/playback', ctrl.playback);

// ── Protected routes ──
r.use(authMiddleware, attachPermissions());

// CRUD
r.post('/', requirePermission('podcast', 'create'), ctrl.create);
r.patch('/:id', requirePermission('podcast', 'update'), ctrl.update);

// Video & Thumbnail uploads
r.post('/:id/video', requirePermission('podcast', 'update'), videoUpload.single('video'), ctrl.uploadVideo);
r.delete('/:id/video', requirePermission('podcast', 'update'), ctrl.removeVideo);
r.post('/:id/thumbnail', requirePermission('podcast', 'update'), imageUpload.single('thumbnail'), ctrl.uploadThumbnail);
r.delete('/:id/thumbnail', requirePermission('podcast', 'update'), ctrl.removeThumbnail);

// Status transitions
r.patch('/:id/coming-soon', requirePermission('podcast', 'update'), ctrl.markComingSoon);
r.patch('/:id/submit', requirePermission('podcast', 'update'), ctrl.submit);
r.patch('/:id/approve', requirePermission('podcast', 'approve'), ctrl.approve);
r.patch('/:id/reject', requirePermission('podcast', 'approve'), ctrl.reject);
r.patch('/:id/publish', requirePermission('podcast', 'update'), ctrl.publish);
r.patch('/:id/archive', requirePermission('podcast', 'update'), ctrl.archive);

// Soft delete / restore / hard delete
r.patch('/:id/restore', requirePermission('podcast', 'restore'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('podcast', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('podcast', 'soft_delete'), ctrl.softDelete);

export default r;
