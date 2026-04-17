import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './categoryTranslation.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('category_translation', 'create'), upload.single('image'), ctrl.create);
r.patch('/:id',  requirePermission('category_translation', 'update'), upload.single('image'), ctrl.update);
r.delete('/:id', requirePermission('category_translation', 'delete'), ctrl.remove);

export default r;
