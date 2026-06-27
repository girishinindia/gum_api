import { Router } from 'express';
import * as ctrl from './enrollment.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

r.use(authMiddleware, attachPermissions());

r.get('/', ctrl.list);
r.get('/user/:userId', ctrl.getByUser);
r.get('/:id/progress', ctrl.getProgress);
// Phase 3.2 — signed video playback URL (Bunny Stream token auth)
r.get('/:id/playback/:videoId', ctrl.getPlaybackUrl);
// Phase 46 (content app) — enrolled-only curriculum tree WITH per-lesson
// video ids + completed sub-topics, for the mobile course player.
r.get('/:id/content', ctrl.getContent);
r.get('/:id', ctrl.getById);
// Owner-or-admin gated inside the controller: the enrollment owner may
// update their own lesson progress (learner self-service); others need the
// enrollment_progress:create permission.
r.post('/:id/progress', ctrl.updateProgress);
r.post('/', requirePermission('enrollment', 'create'), ctrl.create);
r.patch('/:id/restore', requirePermission('enrollment', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('enrollment', 'update'), ctrl.update);
r.delete('/:id', requirePermission('enrollment', 'soft_delete'), ctrl.softDelete);

export default r;
