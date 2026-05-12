import { Router } from 'express';
import { getDashboardStats } from './revenueDashboard.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const router = Router();

router.use(authMiddleware, attachPermissions());
router.get('/stats', requirePermission('order', 'read'), getDashboardStats);

export default router;
