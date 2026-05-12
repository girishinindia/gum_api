import { Router } from 'express';
import * as ctrl from './quickReply.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public read
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected writes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('quick_reply', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('quick_reply', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('quick_reply', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('quick_reply', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('quick_reply', 'soft_delete'), ctrl.softDelete);

export default r;
