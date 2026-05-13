import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './adminRevenue.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Reading the dashboard requires the same permission used by the rest of
// the revenue/finance surface area.
// Reads use the same permission as analytics dashboards; refresh is a
// mutation but a cheap one, so we gate it behind 'read' too (admins only).
r.get('/daily',    requirePermission('analytics', 'read'), ctrl.dailyRevenue);
r.post('/refresh', requirePermission('analytics', 'read'), ctrl.refreshNow);

export default r;
