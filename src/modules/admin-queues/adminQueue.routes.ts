import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requireSuperAdmin } from '../../middleware/rbac';
import * as ctrl from './adminQueue.controller';

const r = Router();

// Strictly super-admin. The queue control plane lets you replay failed
// payment notifications / emails / etc. — must not be wider than that.
r.use(authMiddleware, attachPermissions(), requireSuperAdmin());

r.get('/',                                   ctrl.list);
r.post('/:name/retry-failed',                ctrl.retryAll);
r.post('/:name/jobs/:jobId/retry',           ctrl.retryOne);

export default r;
