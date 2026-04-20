import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './chapter.controller';

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('chapter', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('chapter', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('chapter', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('chapter', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('chapter', 'soft_delete'), ctrl.softDelete);
export default r;
