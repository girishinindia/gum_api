import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './chapterTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('chapter_translation', 'create'), upload.single('image_file'), ctrl.create);
r.patch('/:id',          requirePermission('chapter_translation', 'update'), upload.single('image_file'), ctrl.update);
r.delete('/:id',         requirePermission('chapter_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('chapter_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('chapter_translation', 'delete'), ctrl.remove);

export default r;
