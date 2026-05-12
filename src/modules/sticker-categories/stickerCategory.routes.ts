import { Router } from 'express';
import * as ctrl from './stickerCategory.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public read
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected writes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('sticker_category', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('sticker_category', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('sticker_category', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('sticker_category', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('sticker_category', 'soft_delete'), ctrl.softDelete);

export default r;
