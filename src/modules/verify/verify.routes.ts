import { Router } from 'express';
import { publicVerifyLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './verify.controller';

/**
 * Public verification routes. Intentionally unauthenticated — anyone with
 * a certificate number can validate it. Rate-limited at the route to
 * prevent enumeration. Mounted at /api/v1/verify in app.ts.
 */
const r = Router();

r.get('/cert/:cert_number', publicVerifyLimiter, ctrl.verifyCertificate);

export default r;
