import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './issuedCertificate.controller';

const r = Router();

// Public verification endpoint (no auth required)
r.get('/verify/:certificateNumber', ctrl.verify);

// All other routes are protected
r.use(authMiddleware, attachPermissions());

r.get('/',    requirePermission('issued_certificate', 'read'), ctrl.list);
r.get('/:id', requirePermission('issued_certificate', 'read'), ctrl.getById);

// Issue certificates
r.post('/issue',      requirePermission('issued_certificate', 'create'), ctrl.issue);
r.post('/bulk-issue', requirePermission('issued_certificate', 'create'), ctrl.bulkIssue);

// Revoke
r.patch('/:id/revoke',  requirePermission('issued_certificate', 'update'), ctrl.revoke);

// Soft delete / restore / permanent delete
r.patch('/:id/restore',    requirePermission('issued_certificate', 'restore'),     ctrl.restore);
r.delete('/:id/permanent', requirePermission('issued_certificate', 'delete'),      ctrl.remove);
r.delete('/:id',           requirePermission('issued_certificate', 'soft_delete'), ctrl.softDelete);

export default r;
