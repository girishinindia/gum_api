import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as ctrl from './meDashboard.controller';

const r = Router();

r.use(authMiddleware);

// The signed-in student's dashboard summary (June 2026 — replaces the
// hardcoded stats/continue/upcoming sections on the web dashboard).
r.get('/me', ctrl.summary);

export default r;
