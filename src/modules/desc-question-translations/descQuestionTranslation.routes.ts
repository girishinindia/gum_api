import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './descQuestionTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('desc_question_translation', 'create'), upload.fields([
  { name: 'image_1_file', maxCount: 1 },
  { name: 'image_2_file', maxCount: 1 },
]), ctrl.create);
r.patch('/:id',          requirePermission('desc_question_translation', 'update'), upload.fields([
  { name: 'image_1_file', maxCount: 1 },
  { name: 'image_2_file', maxCount: 1 },
]), ctrl.update);
r.delete('/:id',         requirePermission('desc_question_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('desc_question_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('desc_question_translation', 'delete'), ctrl.remove);

export default r;
