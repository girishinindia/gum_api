import { Router } from 'express';
import * as ctrl from './enrollment.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/user/:userId', ctrl.getByUser);
r.get('/:id/progress', ctrl.getProgress);
r.get('/:id', ctrl.getById);
r.post('/:id/progress', requirePermission('enrollment_progress', 'create'), ctrl.updateProgress);
r.post('/', requirePermission('enrollment', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('enrollment', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('enrollment', 'update'), ctrl.update);
r.delete('/:id', requirePermission('enrollment', 'soft_delete'), ctrl.softDelete);

export default r;
