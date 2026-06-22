import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './aboutPage.controller';

const r = Router();

// Public — gum_web About page reads this
r.get('/', ctrl.get);

// Admin — edit the single About record
r.use(authMiddleware, attachPermissions());
r.put('/', requirePermission('about_page', 'update'), ctrl.update);

export default r;
