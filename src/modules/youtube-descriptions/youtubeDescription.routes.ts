import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './youtubeDescription.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', requirePermission('ai', 'read'), ctrl.list);
r.get('/sub-topic/:subTopicId', requirePermission('ai', 'read'), ctrl.getBySubTopicId);
r.get('/:id', requirePermission('ai', 'read'), ctrl.getById);
r.put('/:id', requirePermission('ai', 'update'), ctrl.update);
r.post('/bulk-delete', requirePermission('ai', 'delete'), ctrl.bulkDelete);
r.delete('/:id', requirePermission('ai', 'delete'), ctrl.remove);

export default r;
