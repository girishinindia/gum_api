import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './subCategory.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('sub_category', 'create'),      upload.single('image'), ctrl.create);
r.patch('/:id/restore',   requirePermission('sub_category', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('sub_category', 'update'),      upload.single('image'), ctrl.update);
r.delete('/:id/permanent', requirePermission('sub_category', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('sub_category', 'soft_delete'), ctrl.softDelete);

export default r;
