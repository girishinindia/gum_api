import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './owQuestionTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('ow_question_translation', 'create'), upload.fields([
  { name: 'image_1_file', maxCount: 1 },
  { name: 'image_2_file', maxCount: 1 },
]), ctrl.create);
r.patch('/:id',          requirePermission('ow_question_translation', 'update'), upload.fields([
  { name: 'image_1_file', maxCount: 1 },
  { name: 'image_2_file', maxCount: 1 },
]), ctrl.update);
r.delete('/:id',         requirePermission('ow_question_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('ow_question_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('ow_question_translation', 'delete'), ctrl.remove);

export default r;
