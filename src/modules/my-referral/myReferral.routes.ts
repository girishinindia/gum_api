import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as ctrl from './myReferral.controller';

const r = Router();

// Self-serve — any logged-in user manages their own referral code + stats
r.use(authMiddleware);
r.get('/', ctrl.getMine);
r.get('/usages', ctrl.myUsages);
r.get('/rewards', ctrl.myRewards);

export default r;
