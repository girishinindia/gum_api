import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './homePage.controller';

const r = Router();

// Public — gum_web homepage reads this
r.get('/', ctrl.get);

// Admin — edit the single homepage record
r.use(authMiddleware, attachPermissions());
r.put('/', requirePermission('home_page', 'update'), ctrl.update);

export default r;
