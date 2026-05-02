import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './owSynonymTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('ow_synonym_translation', 'create'), ctrl.create);
r.patch('/:id',          requirePermission('ow_synonym_translation', 'update'), ctrl.update);
r.delete('/:id',         requirePermission('ow_synonym_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('ow_synonym_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('ow_synonym_translation', 'delete'), ctrl.remove);

export default r;
