import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './permission.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());
r.get('/',        requirePermission('permission', 'read'), ctrl.list);
r.get('/grouped', requirePermission('permission', 'read'), ctrl.listGrouped);
r.patch('/:id/toggle-active', requirePermission('permission', 'activate'), ctrl.toggleActive);
export default r;
