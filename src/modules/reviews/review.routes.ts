import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './review.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Stats + option lists (before /:id to avoid conflict)
r.get('/stats',         requirePermission('review', 'read'), ctrl.stats);
r.get('/user-options',  requirePermission('review', 'read'), ctrl.userOptions);
r.get('/item-options',  requirePermission('review', 'read'), ctrl.itemOptions);

// CRUD
r.get('/',              requirePermission('review', 'read'),   ctrl.list);
r.get('/:id',           requirePermission('review', 'read'),   ctrl.getById);
r.post('/',             requirePermission('review', 'create'), ctrl.create);
r.put('/:id',           requirePermission('review', 'update'), ctrl.update);

// Status change
r.patch('/:id/status',  requirePermission('review', 'update'), ctrl.changeStatus);

// Soft delete / restore
r.patch('/:id/soft-delete', requirePermission('review', 'soft_delete'), ctrl.softDelete);
r.patch('/:id/restore',     requirePermission('review', 'restore'),     ctrl.restore);

// Permanent delete
r.delete('/:id',        requirePermission('review', 'delete'), ctrl.permanentDelete);

// Admin recalculate
r.post('/recalculate',  requirePermission('review', 'update'), ctrl.triggerRecalculate);

export default r;
