import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './course.controller';
import * as importCtrl from './courseImport.controller';

const r = Router();
// Phase 15.4 — Media-tab uploads (trailer thumbnail image + brochure PDF).
// 30 MB limit covers brochures comfortably; images get resized server-side.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const mediaUpload = upload.fields([
  { name: 'trailer_thumbnail', maxCount: 1 },
  { name: 'brochure',          maxCount: 1 },
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
