import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './materialTree.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', requirePermission('subject', 'read'), ctrl.list);
r.get('/full', requirePermission('subject', 'read'), ctrl.fullTree);
r.delete('/folder', requirePermission('subject', 'delete'), ctrl.deleteFolder);

// CDN cleanup / migration endpoints
r.post('/fix-orphaned-subtopic-folders', requirePermission('subject', 'delete'), ctrl.fixOrphanedSubtopicFolders);
r.post('/reconcile-folder-names', requirePermission('subject', 'delete'), ctrl.reconcileFolderNames);
r.post('/clean-orphaned-collections', requirePermission('subject', 'delete'), ctrl.cleanOrphanedCollections);

export default r;
