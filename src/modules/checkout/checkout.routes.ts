import { Router } from 'express';
import * as ctrl from './checkout.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { checkoutLimiter } from '../../middleware/rateLimiter';

const r = Router();

/**
 * @openapi
 * /checkout/config:
 *   get:
 *     tags: [Commerce]
 *     summary: Get Razorpay client config
 *     description: Returns the Razorpay key_id and currency for frontend checkout integration.
 *     security: []
 *     responses:
 *       200:
 *         description: Razorpay config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     keyId: { type: string }
 *                     currency: { type: string, example: INR }
 */
r.get('/config', ctrl.getCheckoutConfig);

/**
 * @openapi
 * /checkout/webhook:
 *   post:
 *     tags: [Commerce]
 *     summary: Razorpay webhook handler
 *     description: Receives payment events from Razorpay. Verified via x-razorpay-signature header.
 *     security: []
 *     responses:
 *       200: { description: Webhook processed }
 *       400: { description: Invalid signature }
 */
r.post('/webhook', ctrl.handleWebhook);

// Authenticated routes
r.use(authMiddleware, attachPermissions());

/**
 * @openapi
 * /checkout/initiate:
 *   post:
 *     tags: [Commerce]
 *     summary: Initiate a checkout (create Razorpay order)
 *     description: Creates an order from the user's cart and returns a Razorpay order_id for frontend payment.
 *     responses:
 *       201: { description: Order created with Razorpay order_id }
 *       400: { description: Empty cart or validation error }
 */
r.post('/initiate', checkoutLimiter, requirePermission('order', 'create'), ctrl.initiateCheckout);

/**
 * @openapi
 * /checkout/verify:
 *   post:
 *     tags: [Commerce]
 *     summary: Verify payment after Razorpay checkout
 *     description: Verifies the Razorpay payment signature, records the payment, and creates enrollments.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature]
 *             properties:
 *               razorpay_order_id: { type: string }
 *               razorpay_payment_id: { type: string }
 *               razorpay_signature: { type: string }
 *     responses:
 *       200: { description: Payment verified and enrollments created }
 *       400: { description: Invalid signature or order }
 */
r.post('/verify', checkoutLimiter, requirePermission('order', 'create'), ctrl.verifyPayment);

/**
 * @openapi
 * /checkout/refund:
 *   post:
 *     tags: [Commerce]
 *     summary: Process a refund
 *     description: Initiates a refund for a completed payment via Razorpay.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId]
 *             properties:
 *               paymentId: { type: string, format: uuid }
 *               amount: { type: number, description: "Partial refund amount (optional, defaults to full)" }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Refund initiated }
 *       400: { description: Payment not found or already refunded }
 */
r.post('/refund', checkoutLimiter, requirePermission('refund', 'create'), ctrl.processRefund);

export default r;
