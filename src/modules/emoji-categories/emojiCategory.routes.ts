import { Router } from 'express';
import * as ctrl from './emojiCategory.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public read
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected writes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('emoji_category', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('emoji_category', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('emoji_category', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('emoji_category', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('emoji_category', 'soft_delete'), ctrl.softDelete);

export default r;
