import { Router } from 'express';
import * as ctrl from './announcement.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', requirePermission('announcement', 'read'), ctrl.list);
r.get('/:id', requirePermission('announcement', 'read'), ctrl.getById);
r.get('/:id/stats', requirePermission('announcement', 'read'), ctrl.readStats);
r.get('/:id/reads', requirePermission('announcement_read', 'read'), ctrl.listReads);

r.post('/', requirePermission('announcement', 'create'), ctrl.create);
r.post('/:id/publish', requirePermission('announcement', 'publish'), ctrl.publish);
r.post('/:id/archive', requirePermission('announcement', 'update'), ctrl.archive);

r.patch('/:id/restore', requirePermission('announcement', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('announcement', 'update'), ctrl.update);

r.delete('/:id/permanent', requirePermission('announcement', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('announcement', 'soft_delete'), ctrl.softDelete);

export default r;
