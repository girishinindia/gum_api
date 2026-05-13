import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './stickerCategory.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public read
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected writes (Phase 15.1 — thumbnail upload via multer)
r.use(authMiddleware, attachPermissions());
r.post('/',                      requirePermission('sticker_category', 'create'),      upload.single('thumbnail'), ctrl.create);
r.patch('/:id/restore',          requirePermission('sticker_category', 'restore'),     ctrl.restore);
r.patch('/:id',                  requirePermission('sticker_category', 'update'),      upload.single('thumbnail'), ctrl.update);
r.delete('/:id/permanent',       requirePermission('sticker_category', 'delete'),      ctrl.remove);
r.delete('/:id',                 requirePermission('sticker_category', 'soft_delete'), ctrl.softDelete);

export default r;
