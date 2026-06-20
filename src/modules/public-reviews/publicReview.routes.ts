import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as ctrl from './publicReview.controller';

const r = Router();

// Public read — published reviews + summary for an item (no auth)
r.get('/', ctrl.listForItem);

// Authenticated, scoped strictly to the caller's own review
r.get('/mine',    authMiddleware, ctrl.myReview);
r.post('/',       authMiddleware, ctrl.upsertOwn);
r.delete('/mine', authMiddleware, ctrl.deleteOwn);

// Helpful votes (any signed-in user; scoped to the caller)
r.get('/my-helpful', authMiddleware, ctrl.myHelpful);
r.post('/helpful',   authMiddleware, ctrl.toggleHelpful);

export default r;
