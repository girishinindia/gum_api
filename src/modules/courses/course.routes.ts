import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './course.controller';
import * as importCtrl from './courseImport.controller';

const r = Router();
// Phase 15.4 + 15.5 — Media-tab uploads.
//   • trailer_thumbnail (image) + brochure (PDF) → small, stay in memory
//   • trailer_video + video (large) → multi-GB, must spool to disk
// We use disk storage uniformly so all 4 fields land at the same place,
// then the controller streams videos and reads buffers for the small ones.
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB per file
});
const mediaUpload = upload.fields([
  { name: 'trailer_thumbnail', maxCount: 1 },
  { name: 'brochure',          maxCount: 1 },
  { name: 'trailer_video',     maxCount: 1 },
  { name: 'video',             maxCount: 1 },
]);

// Phase 44.11 — dedicated course video upload (mirrors the working
// sub-topic pattern). MEMORY storage → req.file.buffer → uploadVideoToStream
// buffer PUT. Separate from the combined mediaUpload so videos use the proven
// path, not the broken streaming one. 500 MB cap (same as sub-topics).
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

r.get('/',     ctrl.list);
// S9 — languages that have at least one published course (for filter dropdown)
r.get('/languages', ctrl.courseLanguages);
// Phase 44.10 Probe B — Bunny Stream diagnostic. MUST be before /:id so it
// isn't swallowed by the param route. Auth-gated below via the middleware
// block is too late, so gate it inline. REMOVE after the video bug is fixed.
r.get('/_debug/bunny-stream', authMiddleware, ctrl.debugBunnyStream);
r.get('/by-slug/:slug', ctrl.getBySlug);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/import/preview',  requirePermission('course', 'create'),      importCtrl.preview);
r.post('/import',          requirePermission('course', 'create'),      importCtrl.importCourse);
r.post('/',                requirePermission('course', 'create'),      mediaUpload, ctrl.create);
// Phase 45.1 — signed playback URLs for the admin video preview (the
// token-gated Bunny library returns 403 on the raw embed URL).
r.get('/:id/playback',              requirePermission('course', 'read'),   ctrl.coursePlayback);
// Phase 44.11 — dedicated video upload endpoints (buffer + uploadVideoToStream)
r.post('/:id/upload-video',         requirePermission('course', 'update'), videoUpload.single('video'), ctrl.uploadCourseVideo);
r.post('/:id/upload-trailer-video', requirePermission('course', 'update'), videoUpload.single('video'), ctrl.uploadCourseTrailerVideo);
r.patch('/:id/restore',   requirePermission('course', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course', 'update'),      mediaUpload, ctrl.update);
r.delete('/:id/permanent', requirePermission('course', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course', 'soft_delete'), ctrl.softDelete);

export default r;
