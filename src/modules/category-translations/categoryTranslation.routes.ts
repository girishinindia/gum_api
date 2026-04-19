import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './categoryTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
const multiUpload = upload.fields([{ name: 'og_image_file', maxCount: 1 }, { name: 'twitter_image_file', maxCount: 1 }]);
r.post('/',              requirePermission('category_translation', 'create'), multiUpload, ctrl.create);
r.patch('/:id',          requirePermission('category_translation', 'update'), multiUpload, ctrl.update);
r.delete('/:id',         requirePermission('category_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('category_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('category_translation', 'delete'), ctrl.remove);

export default r;
