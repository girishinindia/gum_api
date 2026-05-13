import { Router } from 'express';
import * as ctrl from './pushDevice.controller';

/**
 * Phase 11.2.5 — Public push endpoints.
 * Currently only the VAPID public-key fetch; mounted at /api/v1/push.
 */
const r = Router();

r.get('/vapid-public-key', ctrl.getVapidPublicKey);

export default r;
