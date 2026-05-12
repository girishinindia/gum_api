import { Router } from 'express';
import * as ctrl from './chatReaction.controller';
import { authMiddleware } from '../../middleware/auth';

const r = Router();

// All routes require auth (no RBAC — any logged-in user can react)
r.use(authMiddleware);

r.get('/message/:messageId', ctrl.listByMessage);
r.post('/', ctrl.toggleReaction);
r.delete('/:id', ctrl.remove);

export default r;
