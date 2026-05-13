import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './adminDashboards.controller';

/**
 * Phase 14 — Management dashboards.
 *
 * Each route returns the full payload for one dashboard in a single
 * round-trip. Mounted at /api/v1/admin/dashboards in app.ts.
 *
 * Gated behind `analytics:read` (the same permission used for the
 * existing /admin/revenue/* routes). Super admins bypass.
 */
const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/executive',  requirePermission('analytics', 'read'), ctrl.executive);
r.get('/sales',      requirePermission('analytics', 'read'), ctrl.sales);
r.get('/finance',    requirePermission('analytics', 'read'), ctrl.finance);
r.get('/operations', requirePermission('analytics', 'read'), ctrl.operations);
r.get('/catalog',    requirePermission('analytics', 'read'), ctrl.catalog);
r.get('/engagement', requirePermission('analytics', 'read'), ctrl.engagement);

export default r;
