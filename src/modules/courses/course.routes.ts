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

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/import/preview',  requirePermission('course', 'create'),      importCtrl.preview);
r.post('/import',          requirePermission('course', 'create'),      importCtrl.importCourse);
r.post('/',                requirePermission('course', 'create'),      mediaUpload, ctrl.create);
r.patch('/:id/restore',   requirePermission('course', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course', 'update'),      mediaUpload, ctrl.update);
r.delete('/:id/permanent', requirePermission('course', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course', 'soft_delete'), ctrl.softDelete);

export default r;
