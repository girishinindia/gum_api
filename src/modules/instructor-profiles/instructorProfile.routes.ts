import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './instructorProfile.controller';

const r = Router();

// ── All routes require auth for profile modules ──
r.use(authMiddleware, attachPermissions());

// ── Own-profile routes (user can always access their own) ──
// These MUST come before /:id to avoid route shadowing
r.get('/user/:userId', requirePermissionOrOwn('instructor_profile', 'read'), ctrl.getByUserId);
r.put('/user/:userId', requirePermissionOrOwn('instructor_profile', 'update'), ctrl.upsertByUserId);

// ── Admin CRUD ──
r.get('/', requirePermission('instructor_profile', 'read'), ctrl.list);
r.post('/', requirePermission('instructor_profile', 'create'), ctrl.create);
r.get('/:id', requirePermission('instructor_profile', 'read'), ctrl.getById);
r.patch('/:id/restore', requirePermission('instructor_profile', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('instructor_profile', 'update'), ctrl.update);
r.delete('/:id/permanent', requirePermission('instructor_profile', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('instructor_profile', 'soft_delete'), ctrl.softDelete);

export default r;

/** Allow if user has the permission OR is accessing their own profile */
function requirePermissionOrOwn(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Super admin always passes
    if (req.userPerms?.isSuperAdmin) { req.permConditions = null; return next(); }
    // Own profile — allow
    if (req.user?.id && String(req.params.userId) === String(req.user.id)) return next();
    // Fall back to normal permission check
    const p = req.userPerms?.permissions?.find((p: any) => p.resource === resource && p.action === action);
    if (!p) return res.status(403).json({ success: false, error: `Permission denied: ${resource}:${action}` });
    req.permConditions = p.conditions || null;
    next();
  };
}
