import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requireSuperAdmin } from '../../middleware/rbac';
import * as ctrl from './permission.controller';

const r = Router();
r.use(authMiddleware, attachPermissions(), requireSuperAdmin());

// Permission management — super_admin only
r.get('/',         ctrl.list);
r.get('/grouped',  ctrl.listGrouped);
r.patch('/:id',    ctrl.update);

export default r;
