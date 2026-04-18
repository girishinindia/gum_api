import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions } from '../../middleware/rbac';
import * as ctrl from './tableSummary.controller';

const r = Router();

// Public: read summary counts (used by admin dashboard / page headers)
r.get('/', ctrl.list);

// Protected: manual sync operations
r.use(authMiddleware, attachPermissions());
r.post('/sync',            ctrl.syncAll);
r.post('/sync/:tableName', ctrl.syncOne);

export default r;
