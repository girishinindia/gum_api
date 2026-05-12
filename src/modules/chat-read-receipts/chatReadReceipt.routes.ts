import { Router } from 'express';
import * as ctrl from './chatReadReceipt.controller';
import { authMiddleware } from '../../middleware/auth';

const r = Router();

// All routes require auth (no RBAC — any logged-in user can read/mark)
r.use(authMiddleware);

r.get('/unread-count', ctrl.unreadCounts);
r.get('/room/:roomId', ctrl.listByRoom);
r.post('/', ctrl.markRead);

export default r;
