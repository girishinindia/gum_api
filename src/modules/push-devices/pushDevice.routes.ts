import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as ctrl from './pushDevice.controller';
import { registerPushDeviceSchema } from './pushDevice.schema';

/**
 * Phase 11.2.5 — Authenticated push-device routes.
 * Mounted at /api/v1/push-devices in app.ts. The public VAPID key endpoint
 * lives on a sibling router (./pushPublic.routes) so it can be unauthenticated.
 */
const r = Router();

r.use(authMiddleware, attachPermissions());

r.post('/register',          validate(registerPushDeviceSchema), ctrl.register);
r.get('/me',                 ctrl.listMine);                       // GET /push-devices/me
r.delete('/:endpoint',       ctrl.unregister);                     // endpoint URL-encoded

export default r;
