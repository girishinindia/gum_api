import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './blogPost.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Phase 15.1 — support both featured_image + og_image uploads via .fields()
const blogUpload = upload.fields([
  { name: 'featured_image', maxCount: 1 },
  { name: 'og_image',       maxCount: 1 },
]);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('blog_post', 'create'), blogUpload, ctrl.create);
r.patch('/:id/publish', requirePermission('blog_post', 'update'), ctrl.publish);
r.patch('/:id/archive', requirePermission('blog_post', 'update'), ctrl.archive);
r.patch('/:id/restore', requirePermission('blog_post', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('blog_post', 'update'), blogUpload, ctrl.update);
r.delete('/:id/permanent', requirePermission('blog_post', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('blog_post', 'soft_delete'), ctrl.softDelete);

export default r;
