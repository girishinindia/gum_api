import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './country.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('country', 'create'),      upload.single('flag_image'), ctrl.create);
r.patch('/:id/restore',   requirePermission('country', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('country', 'update'),      upload.single('flag_image'), ctrl.update);
r.delete('/:id/permanent', requirePermission('country', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('country', 'soft_delete'), ctrl.softDelete);

export default r;
