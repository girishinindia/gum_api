import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './activityLog.controller';

const r = Router();
r.use(authMiddleware, attachPermissions(), requirePermission('activity_log', 'read'));
r.get('/auth',   ctrl.authLogs);
r.get('/admin',  ctrl.adminLogs);
r.get('/data',   ctrl.dataLogs);
r.get('/system', ctrl.systemLogs);
// Distinct action list per type (for the filter dropdown)
r.get('/:type/actions', ctrl.logActions);
export default r;
