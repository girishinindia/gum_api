import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './revenueShareTier.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Instructor-facing: own resolved rates + the revenue-share rules.
// MUST be before any param routes.
r.get('/my-rates', ctrl.myRates);

// Admin management — reuses the instructor_earning permission set.
r.get('/',              requirePermission('instructor_earning', 'read'),   ctrl.list);
r.post('/',             requirePermission('instructor_earning', 'update'), ctrl.create);
r.patch('/:id/restore', requirePermission('instructor_earning', 'update'), ctrl.restore);
r.patch('/:id',         requirePermission('instructor_earning', 'update'), ctrl.update);
r.delete('/:id',        requirePermission('instructor_earning', 'update'), ctrl.softDelete);

export default r;
