import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './owSynonym.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('ow_synonym', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('ow_synonym', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('ow_synonym', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('ow_synonym', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('ow_synonym', 'soft_delete'), ctrl.softDelete);

export default r;
