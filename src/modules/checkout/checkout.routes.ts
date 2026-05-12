import { Router } from 'express';
import * as ctrl from './checkout.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const r = Router();

// Public: Razorpay config (key_id + currency)
r.get('/config', ctrl.getCheckoutConfig);

// Webhook: no auth — Razorpay verifies via signature header
r.post('/webhook', ctrl.handleWebhook);

// Authenticated routes
r.use(authMiddleware, attachPermissions());
r.post('/initiate', requirePermission('order', 'create'), ctrl.initiateCheckout);
r.post('/verify', requirePermission('order', 'create'), ctrl.verifyPayment);
r.post('/refund', requirePermission('refund', 'create'), ctrl.processRefund);

export default r;
