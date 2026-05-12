import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './supportTicket.controller';

const r = Router();

// ALL protected
r.use(authMiddleware, attachPermissions());

// Stats must come before /:id
r.get('/stats',              requirePermission('support_ticket', 'read'),        ctrl.stats);
r.get('/',                   requirePermission('support_ticket', 'read'),        ctrl.list);
r.get('/:id',               requirePermission('support_ticket', 'read'),        ctrl.getById);
r.post('/',                  requirePermission('support_ticket', 'create'),      ctrl.create);
r.patch('/:id/status',      requirePermission('support_ticket', 'update'),      ctrl.changeStatus);
r.patch('/:id/assign',      requirePermission('support_ticket', 'update'),      ctrl.assign);
r.patch('/:id/restore',     requirePermission('support_ticket', 'restore'),     ctrl.restore);
r.patch('/:id',             requirePermission('support_ticket', 'update'),      ctrl.update);
r.delete('/:id/permanent',  requirePermission('support_ticket', 'delete'),      ctrl.remove);
r.delete('/:id',            requirePermission('support_ticket', 'soft_delete'), ctrl.softDelete);

export default r;
