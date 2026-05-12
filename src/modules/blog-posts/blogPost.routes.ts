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

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('blog_post', 'create'), upload.single('featured_image'), ctrl.create);
r.patch('/:id/publish', requirePermission('blog_post', 'update'), ctrl.publish);
r.patch('/:id/archive', requirePermission('blog_post', 'update'), ctrl.archive);
r.patch('/:id/restore', requirePermission('blog_post', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('blog_post', 'update'), upload.single('featured_image'), ctrl.update);
r.delete('/:id/permanent', requirePermission('blog_post', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('blog_post', 'soft_delete'), ctrl.softDelete);

export default r;
