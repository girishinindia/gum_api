import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions } from '../../middleware/rbac';
import * as ctrl from './siteSettings.controller';

const r = Router();

// ── Public: frontend fetches section visibility without auth ──
r.get('/sections', ctrl.listSections);

// ── Protected: admin-only routes ──
r.use(authMiddleware, attachPermissions());

// SuperAdmin guard
const superAdminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.userPerms?.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  next();
};

r.get('/',    superAdminOnly, ctrl.listAll);
r.patch('/:id', superAdminOnly, ctrl.updateSection);

export default r;
