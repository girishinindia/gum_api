import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './orderingItem.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('ordering_item', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('ordering_item', 'delete'),      ctrl.restore);
r.patch('/:id',           requirePermission('ordering_item', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('ordering_item', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('ordering_item', 'delete'),      ctrl.softDelete);

export default r;
