import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './ticketCategory.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('ticket_category', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('ticket_category', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('ticket_category', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('ticket_category', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('ticket_category', 'soft_delete'), ctrl.softDelete);

export default r;
