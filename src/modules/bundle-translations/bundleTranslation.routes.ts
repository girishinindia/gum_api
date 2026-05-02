import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './bundleTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('bundle_translation', 'create'), upload.fields([
  { name: 'thumbnail_url_file', maxCount: 1 },
  { name: 'banner_url_file', maxCount: 1 },
]), ctrl.create);
r.patch('/:id',          requirePermission('bundle_translation', 'update'), upload.fields([
  { name: 'thumbnail_url_file', maxCount: 1 },
  { name: 'banner_url_file', maxCount: 1 },
]), ctrl.update);
r.delete('/:id',         requirePermission('bundle_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('bundle_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('bundle_translation', 'delete'), ctrl.remove);

export default r;
