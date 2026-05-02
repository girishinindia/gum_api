import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './mcqOptionTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('mcq_option_translation', 'create'), upload.fields([
  { name: 'image_file', maxCount: 1 },
]), ctrl.create);
r.patch('/:id',          requirePermission('mcq_option_translation', 'update'), upload.fields([
  { name: 'image_file', maxCount: 1 },
]), ctrl.update);
r.delete('/:id',         requirePermission('mcq_option_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('mcq_option_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('mcq_option_translation', 'delete'), ctrl.remove);

export default r;
