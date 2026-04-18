import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './category.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('category', 'create'),      upload.single('image'), ctrl.create);
r.patch('/:id/restore',   requirePermission('category', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('category', 'update'),      upload.single('image'), ctrl.update);
r.delete('/:id/permanent', requirePermission('category', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('category', 'soft_delete'), ctrl.softDelete);

export default r;
