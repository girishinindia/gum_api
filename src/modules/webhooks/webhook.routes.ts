import { Router } from 'express';
import * as bunny from './bunnyStream.controller';
import * as razorpayx from './razorpayx.controller';

/**
 * Webhook receivers. Each route here is intentionally UNAUTHENTICATED
 * (the originating service can't carry a user JWT) and instead protected by
 * provider-specific HMAC signature verification + idempotency via the
 * webhook_events table.
 *
 * Razorpay (payments) webhooks live on /checkout/webhook for historical reasons.
 */
const r = Router();

// Phase 3.3 — Bunny Stream encoding lifecycle webhook
r.post('/bunny-stream', bunny.handleBunnyStreamWebhook);

// Phase 9.7 — RazorpayX payout lifecycle webhook
r.post('/razorpayx', razorpayx.handleRazorpayxWebhook);

export default r;
