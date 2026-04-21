import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './materialTree.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', requirePermission('subject', 'read'), ctrl.list);
r.get('/full', requirePermission('subject', 'read'), ctrl.fullTree);
r.delete('/folder', requirePermission('subject', 'delete'), ctrl.deleteFolder);

export default r;
