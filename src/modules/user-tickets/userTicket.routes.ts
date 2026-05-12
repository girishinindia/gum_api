import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as ctrl from './userTicket.controller';

const r = Router();

// All routes require authentication but NO RBAC — any logged-in user can access
r.use(authMiddleware);

// Categories (public list for ticket creation form)
r.get('/categories', ctrl.getCategories);

// Ticket CRUD (ownership-scoped)
r.get('/',          ctrl.listMyTickets);
r.get('/:id',       ctrl.getMyTicket);
r.post('/',         ctrl.submitTicket);
r.post('/:id/reply', ctrl.replyToTicket);
r.patch('/:id/close', ctrl.closeMyTicket);

export default r;
