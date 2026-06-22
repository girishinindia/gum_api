import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './newsletter.controller';

const r = Router();

// Public — subscribe from the website (no auth)
r.post('/subscribe', ctrl.subscribe);

// Admin — manage subscribers
r.use(authMiddleware, attachPermissions());
r.get('/',              requirePermission('newsletter_subscriber', 'read'),        ctrl.list);
r.patch('/:id/restore', requirePermission('newsletter_subscriber', 'restore'),     ctrl.restore);
r.delete('/:id',        requirePermission('newsletter_subscriber', 'soft_delete'), ctrl.softDelete);

export default r;
