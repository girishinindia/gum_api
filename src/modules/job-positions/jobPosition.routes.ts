import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './jobPosition.controller';

const r = Router();

// Public — gum_web careers page (only active, non-expired, non-deleted)
r.get('/', ctrl.publicList);
r.get('/slug/:slug', ctrl.publicBySlug);

// Admin — auth + RBAC for everything below
r.use(authMiddleware, attachPermissions());
r.get('/admin',            requirePermission('job_position', 'read'),        ctrl.adminList);
r.get('/:id',              requirePermission('job_position', 'read'),        ctrl.getById);
r.post('/',                requirePermission('job_position', 'create'),      ctrl.create);
r.patch('/:id/restore',    requirePermission('job_position', 'restore'),     ctrl.restore);
r.patch('/:id',            requirePermission('job_position', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('job_position', 'delete'),      ctrl.remove);
r.delete('/:id',           requirePermission('job_position', 'soft_delete'), ctrl.softDelete);

export default r;
