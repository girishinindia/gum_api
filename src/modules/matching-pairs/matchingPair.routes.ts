import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './matchingPair.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('matching_pair', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('matching_pair', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('matching_pair', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('matching_pair', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('matching_pair', 'soft_delete'), ctrl.softDelete);

export default r;
