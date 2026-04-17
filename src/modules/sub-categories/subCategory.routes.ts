import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './subCategory.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('sub_category', 'create'), upload.single('image'), ctrl.create);
r.patch('/:id',  requirePermission('sub_category', 'update'), upload.single('image'), ctrl.update);
r.delete('/:id', requirePermission('sub_category', 'delete'), ctrl.remove);

export default r;
