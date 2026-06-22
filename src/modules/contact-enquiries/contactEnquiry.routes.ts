import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './contactEnquiry.controller';

const r = Router();

// Public — submit the contact form (no auth)
r.post('/', ctrl.submit);

// Admin — auth + RBAC for everything below
r.use(authMiddleware, attachPermissions());
r.get('/',              requirePermission('contact_enquiry', 'read'),        ctrl.list);
r.get('/:id',           requirePermission('contact_enquiry', 'read'),        ctrl.getById);
r.patch('/:id/restore', requirePermission('contact_enquiry', 'restore'),     ctrl.restore);
r.patch('/:id',         requirePermission('contact_enquiry', 'update'),      ctrl.update);
r.delete('/:id',        requirePermission('contact_enquiry', 'soft_delete'), ctrl.softDelete);

export default r;
