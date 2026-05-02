import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './matchingPairTranslation.controller';

const r = Router();

r.get('/',          ctrl.list);
r.get('/coverage',  ctrl.coverage);
r.get('/:id',       ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',              requirePermission('matching_pair_translation', 'create'), ctrl.create);
r.patch('/:id',          requirePermission('matching_pair_translation', 'update'), ctrl.update);
r.delete('/:id',         requirePermission('matching_pair_translation', 'delete'), ctrl.softDelete);
r.patch('/:id/restore',  requirePermission('matching_pair_translation', 'delete'), ctrl.restore);
r.delete('/:id/permanent', requirePermission('matching_pair_translation', 'delete'), ctrl.remove);

export default r;
