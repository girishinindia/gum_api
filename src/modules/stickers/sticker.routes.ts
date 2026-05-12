import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './sticker.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public read
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected writes (image upload via multer)
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('sticker', 'create'), upload.single('image'), ctrl.create);
r.patch('/:id/restore', requirePermission('sticker', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('sticker', 'update'), upload.single('image'), ctrl.update);
r.delete('/:id/permanent', requirePermission('sticker', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('sticker', 'soft_delete'), ctrl.softDelete);

export default r;
