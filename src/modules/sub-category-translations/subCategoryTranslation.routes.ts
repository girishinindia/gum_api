import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './subCategoryTranslation.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('sub_category_translation', 'create'), upload.single('image'), ctrl.create);
r.patch('/:id',  requirePermission('sub_category_translation', 'update'), upload.single('image'), ctrl.update);
r.delete('/:id', requirePermission('sub_category_translation', 'delete'), ctrl.remove);

export default r;
