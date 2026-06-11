import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
} from '../../services/razorpay.service';
import { orchestratePostPayment } from '../../services/postPayment.service';
import { reverseEarningsForOrder } from '../../services/instructorEarning.service';
import { notifyRefundProcessed } from '../../services/notification.service';
import {
  beginWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  fallbackEventId,
} from '../../services/webhookEvents.service';

// ── Cache keys ──
const clearOrderCaches = async () => {
  await Promise.all([
    redis.del('orders:all'),
    redis.del('payments:all'),
    redis.del('transactions:all'),
    redis.del('invoices:all'),
    redis.del('enrollments:all'),
    redis.del('cart_items:all'),
  ]);
};

// ── Per-type price + name resolution (columns differ per content type) ──
const ITEM_TABLE: Record<string, { table: string; nameCol: string; hasSlug: boolean; hasFree: boolean }> = {
  course:  { table: 'courses',        nameCol: 'name',  hasSlug: true,  hasFree: true },
  bundle:  { table: 'bundles',        nameCol: 'name',  hasSlug: true,  hasFree: false },
  batch:   { table: 'course_batches', nameCol: 'title', hasSlug: true,  hasFree: true },
  webinar: { table: 'webinars',       nameCol: 'title', hasSlug: false, hasFree: true },
};

async function resolveItemPrice(itemType: string, itemId: number): Promise<{ price: number; name: string; slug: string } | null> {
  const cfg = ITEM_TABLE[itemType];
  if (!cfg) return null;
  const cols = ['id', 'price', cfg.nameCol, ...(cfg.hasSlug ? ['slug'] : []), ...(cfg.hasFree ? ['is_free'] : [])].join(', ');
  const { data } = await supabase.from(cfg.table).select(cols).eq('id', itemId).single();
  if (!data) return null;
  const d = data as any;
  const isFree = cfg.hasFree ? !!d.is_free : false;
  const price = isFree ? 0 : Number(d.price || 0);
  return { price, name: d[cfg.nameCol] || `${itemType} #${itemId}`, slug: cfg.hasSlug ? (d.slug || '') : '' };
}

// ── Build order items from the user's active cart ──
async function buildCartItems(userId: number): Promise<{ orderItems: any[]; subtotal: number; error?: string }> {
  const { data: cartItems, error: cartErr } = await supabase
    .from('cart_items').select('*').eq('user_id', userId).is('deleted_at', null).eq('is_active', true);
  if (cartErr) return { orderItems: [], subtotal: 0, error: cartErr.message };
  if (!cartItems || cartItems.length === 0) return { orderItems: [], subtotal: 0, error: 'Cart is empty' };

  const orderItems: any[] = [];
  let subtotal = 0;
  for (const ci of cartItems) {
    const resolved = await resolveItemPrice(ci.item_type, ci.item_id);
    if (!resolved) return { orderItems: [], subtotal: 0, error: `Item not found: ${ci.item_type} #${ci.item_id}` };
    const qty = ci.quantity || 1;
    subtotal += resolved.price * qty;
    orderItems.push({
      item_type: ci.item_type, item_id: ci.item_id, item_name: resolved.name, item_slug: resolved.slug,
      original_price: resolved.price, discount_amount: 0, tax_amount: 0, final_price: resolved.price, quantity: qty,
    });
  }
  return { orderItems, subtotal };
}

// ── Eligible subtotal for a coupon's scope (specific items → content type → all) ──
async function eligibleSubtotalForCoupon(coupon: any, orderItems: any[]): Promise<number> {
  const junctions = [
    { table: 'coupon_courses',  type: 'course',  col: 'course_id' },
    { table: 'coupon_bundles',  type: 'bundle',  col: 'bundle_id' },
    { table: 'coupon_batches',  type: 'batch',   col: 'batch_id' },
    { table: 'coupon_webinars', type: 'webinar', col: 'webinar_id' },
  ];
  const specific: Record<string, Set<number>> = {};
  let hasSpecific = false;
  for (const j of junctions) {
    const { data } = await supabase.from(j.table).select(j.col).eq('coupon_id', coupon.id).eq('is_active', true).is('deleted_at', null);
    const ids = (data || []).map((r: any) => Number(r[j.col]));
    if (ids.length) { specific[j.type] = new Set(ids); hasSpecific = true; }
  }

  let total = 0;
  for (const oi of orderItems) {
    const line = Number(oi.original_price) * (oi.quantity || 1);
    if (hasSpecific) {
      if (specific[oi.item_type]?.has(Number(oi.item_id))) total += line;          // item-level scope
    } else if (coupon.applicable_to && coupon.applicable_to !== 'all') {
      if (oi.item_type === coupon.applicable_to) total += line;                     // content-type scope
    } else {
      total += line;                                                                // all
    }
  }
  return total;
}

// ── Apply a coupon (scope-aware) ──
async function applyCoupon(code: string, subtotal: number, orderItems: any[], userId: number): Promise<{ valid: boolean; discount: number; couponId: number | null; message?: string }> {
  if (!code) return { valid: false, discount: 0, couponId: null };

  const { data: coupon } = await supabase.from('coupons').select('*')
    .eq('coupon_code', code.toUpperCase()).eq('is_active', true).is('deleted_at', null).maybeSingle();
  if (!coupon) return { valid: false, discount: 0, couponId: null, message: 'Invalid coupon code' };

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) return { valid: false, discount: 0, couponId: null, message: 'Coupon not yet active' };
  if (coupon.valid_until && new Date(coupon.valid_until) < now) return { valid: false, discount: 0, couponId: null, message: 'Coupon has expired' };
  if (coupon.usage_limit && (coupon.used_count || 0) >= coupon.usage_limit) return { valid: false, discount: 0, couponId: null, message: 'Coupon usage limit reached' };
  if (coupon.min_purchase_amount && subtotal < Number(coupon.min_purchase_amount)) return { valid: false, discount: 0, couponId: null, message: `Minimum order amount is ₹${coupon.min_purchase_amount}` };

  if (coupon.usage_per_user) {
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('coupon_id', coupon.id).eq('payment_status', 'paid').is('deleted_at', null);
    if ((count || 0) >= coupon.usage_per_user) return { valid: false, discount: 0, couponId: null, message: 'You have already used this coupon' };
  }

  const eligible = await eligibleSubtotalForCoupon(coupon, orderItems);
  if (eligible <= 0) return { valid: false, discount: 0, couponId: null, message: "This coupon doesn't apply to the items in your cart" };

  let discount = coupon.discount_type === 'percentage'
    ? eligible * (Number(coupon.discount_value) / 100)
    : Number(coupon.discount_value);
  if (coupon.discount_type === 'percentage' && coupon.max_discount_amount && discount > Number(coupon.max_discount_amount)) discount = Number(coupon.max_discount_amount);
  discount = Math.min(discount, eligible);
  return { valid: true, discount: Math.round(discount * 100) / 100, couponId: coupon.id };
}

// ── Apply an instructor promo code (scope = its linked courses, else all course items) ──
async function applyPromo(code: string, orderItems: any[], remainingSubtotal: number): Promise<{ valid: boolean; discount: number; promotionId: number | null; message?: string }> {
  if (!code) return { valid: false, discount: 0, promotionId: null };

  const { data: promo } = await supabase.from('instructor_promotions').select('*')
    .eq('promo_code', code.toUpperCase()).eq('is_active', true).is('deleted_at', null).maybeSingle();
  if (!promo) return { valid: false, discount: 0, promotionId: null, message: 'Invalid promo code' };

  const now = new Date();
  if (promo.promotion_status && !['active', 'approved', 'running'].includes(String(promo.promotion_status))) return { valid: false, discount: 0, promotionId: null, message: 'Promo is not active' };
  if (promo.requires_approval && !promo.approved_at) return { valid: false, discount: 0, promotionId: null, message: 'Promo not approved yet' };
  if (promo.valid_from && new Date(promo.valid_from) > now) return { valid: false, discount: 0, promotionId: null, message: 'Promo not yet active' };
  if (promo.valid_until && new Date(promo.valid_until) < now) return { valid: false, discount: 0, promotionId: null, message: 'Promo has expired' };
  if (promo.usage_limit && (promo.used_count || 0) >= promo.usage_limit) return { valid: false, discount: 0, promotionId: null, message: 'Promo usage limit reached' };

  const { data: pc } = await supabase.from('instructor_promotion_courses').select('course_id').eq('promotion_id', promo.id).eq('is_active', true).is('deleted_at', null);
  const courseIds = new Set((pc || []).map((r: any) => Number(r.course_id)));
  let eligible = 0;
  for (const oi of orderItems) {
    if (oi.item_type !== 'course') continue;
    if (courseIds.size && !courseIds.has(Number(oi.item_id))) continue;
    eligible += Number(oi.original_price) * (oi.quantity || 1);
  }
  eligible = Math.min(eligible, remainingSubtotal);
  if (eligible <= 0) return { valid: false, discount: 0, promotionId: null, message: "This promo doesn't apply to the courses in your cart" };

  let discount = promo.discount_type === 'percentage'
    ? eligible * (Number(promo.discount_value) / 100)
    : Number(promo.discount_value);
  // max_discount_amount caps BOTH types (admin shows "₹200 (max ₹100)" for
  // fixed promos too — previously the cap was only enforced for percentage).
  if (promo.max_discount_amount && discount > Number(promo.max_discount_amount)) discount = Number(promo.max_discount_amount);
  discount = Math.min(discount, eligible);
  return { valid: true, discount: Math.round(discount * 100) / 100, promotionId: promo.id };
}

// ── Shared pricing: cart → subtotal, coupon + promo discounts, total ──
async function computeCartPricing(userId: number, coupon_code?: string, promo_code?: string) {
  const built = await buildCartItems(userId);
  if (built.error) return { error: built.error } as any;
  const { orderItems, subtotal } = built;

  let discountAmount = 0, couponId: number | null = null, promotionId: number | null = null;
  let couponValid = false, promoValid = false;
  let couponMessage: string | undefined, promoMessage: string | undefined;

  if (coupon_code) {
    const r = await applyCoupon(coupon_code, subtotal, orderItems, userId);
    couponValid = r.valid; couponMessage = r.message;
    if (r.valid) { discountAmount += r.discount; couponId = r.couponId; }
  }
  if (promo_code) {
    const r = await applyPromo(promo_code, orderItems, subtotal - discountAmount);
    promoValid = r.valid; promoMessage = r.message;
    if (r.valid) { discountAmount += r.discount; promotionId = r.promotionId; }
  }

  const taxAmount = 0;
  const total = Math.max(Math.round((subtotal - discountAmount + taxAmount) * 100) / 100, 0);
  return { orderItems, subtotal, discountAmount, taxAmount, total, couponId, promotionId, couponValid, promoValid, couponMessage, promoMessage };
}

/**
 * POST /checkout/initiate
 * Convert cart → order → Razorpay order.
 * Body: { user_id, coupon_code?, promo_code?, notes?, billing_* }
 */
export async function initiateCheckout(req: Request, res: Response) {
  try {
    const { coupon_code, promo_code, notes, billing_name, billing_email, billing_phone, billing_address, billing_city, billing_state, billing_country, billing_pincode, gst_number } = req.body;
    const user_id = req.body.user_id || req.user!.id;

    // 1–4. Resolve prices + apply scope-aware coupon/promo discounts.
    const pricing: any = await computeCartPricing(user_id, coupon_code, promo_code);
    if (pricing.error) return err(res, pricing.error, 400);
    if (coupon_code && !pricing.couponValid) return err(res, pricing.couponMessage || 'Invalid coupon', 400);
    if (promo_code && !pricing.promoValid) return err(res, pricing.promoMessage || 'Invalid promo code', 400);

    const { orderItems, subtotal, discountAmount, taxAmount, total: totalRounded, couponId, promotionId } = pricing;

    // 5. Create the order record (auto-generates order_number via trigger)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id,
        subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: totalRounded,
        currency: config.razorpay.currency,
        coupon_id: couponId,
        coupon_code: coupon_code || null,
        promotion_id: promotionId,
        promo_code: promo_code || null,
        order_status: 'pending',
        payment_status: 'unpaid',
        notes: notes || null,
        created_by: req.user!.id,
      })
      .select('*')
      .single();

    if (orderErr) return err(res, orderErr.message, 500);

    // 6. Create order_items
    const itemsToInsert = orderItems.map((oi: any) => ({
      ...oi,
      order_id: order.id,
      created_by: req.user!.id,
    }));
    const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
    if (itemsErr) return err(res, itemsErr.message, 500);

    // 7. Create Razorpay order (only if total > 0)
    let razorpayOrder: any = null;
    if (totalRounded > 0) {
      razorpayOrder = await createRazorpayOrder({
        amount: totalRounded,
        receipt: order.order_number,
        notes: { order_id: String(order.id), user_id: String(user_id) },
      });

      // Update our order with Razorpay order ID
      await supabase
        .from('orders')
        .update({ razorpay_order_id: razorpayOrder.id })
        .eq('id', order.id);
    } else {
      // Free order — auto-confirm
      await supabase
        .from('orders')
        .update({ order_status: 'completed', payment_status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', order.id);

      // Run full post-payment orchestration for free order
      await orchestratePostPayment({
        orderId: order.id,
        userId: user_id,
        createdBy: req.user!.id,
      });
    }

    // 8. Increment coupon + promo usage (paid orders; free orders handled by orchestration)
    if (totalRounded > 0) {
      if (couponId) {
        const { data: c } = await supabase.from('coupons').select('used_count').eq('id', couponId).single();
        if (c) await supabase.from('coupons').update({ used_count: (c.used_count || 0) + 1 }).eq('id', couponId);
      }
      if (promotionId) {
        const { data: p } = await supabase.from('instructor_promotions').select('used_count').eq('id', promotionId).single();
        if (p) await supabase.from('instructor_promotions').update({ used_count: (p.used_count || 0) + 1 }).eq('id', promotionId);
      }
    }

    await clearOrderCaches();
    logAdmin({
      actorId: req.user!.id,
      action: 'order_created',
      targetType: 'order',
      targetId: order.id,
      targetName: order.order_number,
      ip: getClientIp(req),
    });

    return ok(res, {
      order: { ...order, razorpay_order_id: razorpayOrder?.id || null },
      razorpay_order_id: razorpayOrder?.id || null,
      razorpay_key_id: config.razorpay.keyId,
      amount: totalRounded,
      currency: config.razorpay.currency,
      is_free: totalRounded === 0,
    }, 'Checkout initiated', 201);
  } catch (e: any) {
    console.error('[CHECKOUT] initiateCheckout error:', e);
    return err(res, e.message || 'Checkout failed', 500);
  }
}

/**
 * POST /checkout/preview
 * Compute cart totals + coupon/promo discount WITHOUT creating an order.
 * Body: { user_id?, coupon_code?, promo_code? } (user_id defaults to the caller).
 */
export async function previewCheckout(req: Request, res: Response) {
  try {
    const userId = req.body.user_id || req.user!.id;
    const { coupon_code, promo_code } = req.body;
    const pricing: any = await computeCartPricing(userId, coupon_code, promo_code);
    if (pricing.error) return err(res, pricing.error, 400);
    return ok(res, {
      subtotal: pricing.subtotal,
      discount_amount: pricing.discountAmount,
      tax_amount: pricing.taxAmount,
      total: pricing.total,
      item_count: pricing.orderItems.length,
      coupon: coupon_code ? { code: coupon_code, valid: pricing.couponValid, message: pricing.couponMessage } : null,
      promo: promo_code ? { code: promo_code, valid: pricing.promoValid, message: pricing.promoMessage } : null,
    });
  } catch (e: any) {
    return err(res, e.message || 'Preview failed', 500);
  }
}

/**
 * POST /checkout/verify
 * Verify Razorpay payment after checkout modal closes.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id }
 */
export async function verifyPayment(req: Request, res: Response) {
  let webhookRowId: number | null = null;
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return err(res, 'Missing Razorpay verification fields', 400);
    }

    // 1. Verify signature
    const isValid = verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!isValid) return err(res, 'Payment verification failed — invalid signature', 400);

    // 1b. Idempotency gate — keyed on razorpay_payment_id. If two browsers
    //     close the modal simultaneously, only ONE call orchestrates; the
    //     second returns the "already processed" path below.
    const event = await beginWebhookEvent({
      provider: 'razorpay',
      eventId: fallbackEventId('verify', razorpay_payment_id),
      eventType: 'payment.verify',
      relatedType: 'order',
      relatedId: order_id ?? null,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });

    if (!event) {
      const { data: existingOrder } = await supabase
        .from('orders').select('id, order_number, payment_status').eq('razorpay_order_id', razorpay_order_id).single();
      return ok(res, { order: existingOrder, already_processed: true }, 'Payment already verified');
    }
    webhookRowId = event.id;

    // 2. Fetch the Razorpay payment details
    const rpPayment = await fetchPayment(razorpay_payment_id);

    // 3. Find our order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (!order) {
      if (webhookRowId) await failWebhookEvent(webhookRowId, 'order_not_found');
      return err(res, 'Order not found for this Razorpay order', 404);
    }

    // Defense-in-depth — also check order state. The webhook may have fired first.
    if (order.payment_status === 'paid') {
      if (webhookRowId) await completeWebhookEvent(webhookRowId, { skipped: 'already_paid', orderId: order.id });
      return ok(res, { order, already_processed: true }, 'Payment already verified');
    }

    const amountInRupees = (rpPayment.amount as number) / 100;

    // 4. Update order
    await supabase.from('orders').update({
      razorpay_payment_id,
      razorpay_signature,
      order_status: 'completed',
      payment_status: 'paid',
      payment_method: rpPayment.method || null,
      paid_at: new Date().toISOString(),
      updated_by: req.user!.id,
    }).eq('id', order.id);

    // 5. Create payment record
    const { data: payment } = await supabase.from('payments').insert({
      order_id: order.id,
      user_id: order.user_id,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      amount: amountInRupees,
      currency: (rpPayment.currency as string) || config.razorpay.currency,
      payment_method: rpPayment.method || null,
      payment_status: 'captured',
      bank: (rpPayment as any).bank || null,
      wallet: (rpPayment as any).wallet || null,
      vpa: (rpPayment as any).vpa || null,
      card_last4: (rpPayment as any).card?.last4 || null,
      card_network: (rpPayment as any).card?.network || null,
      card_type: (rpPayment as any).card?.type || null,
      fee: (rpPayment as any).fee ? (rpPayment as any).fee / 100 : 0,
      tax: (rpPayment as any).tax ? (rpPayment as any).tax / 100 : 0,
      captured_at: new Date().toISOString(),
      ip_address: getClientIp(req),
      created_by: req.user!.id,
    }).select('*').single();

    // 6. Create transaction record
    await supabase.from('transactions').insert({
      order_id: order.id,
      payment_id: payment?.id || null,
      user_id: order.user_id,
      transaction_type: 'payment',
      amount: amountInRupees,
      currency: (rpPayment.currency as string) || config.razorpay.currency,
      description: `Payment for order ${order.order_number}`,
      reference_type: 'payment',
      reference_id: payment?.id || null,
      razorpay_payment_id,
      status: 'completed',
      created_by: req.user!.id,
    });

    // 7. Create invoice
    await supabase.from('invoices').insert({
      order_id: order.id,
      user_id: order.user_id,
      payment_id: payment?.id || null,
      subtotal: order.subtotal,
      discount_amount: order.discount_amount,
      tax_amount: order.tax_amount,
      total_amount: order.total_amount,
      currency: order.currency,
      invoice_status: 'paid',
      issued_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      billing_name: req.body.billing_name || null,
      billing_email: req.body.billing_email || null,
      billing_phone: req.body.billing_phone || null,
      billing_address: req.body.billing_address || null,
      billing_city: req.body.billing_city || null,
      billing_state: req.body.billing_state || null,
      billing_country: req.body.billing_country || null,
      billing_pincode: req.body.billing_pincode || null,
      gst_number: req.body.gst_number || null,
      created_by: req.user!.id,
    });

    // 8. Run full post-payment orchestration (enrollments, GST, profile update, referrals, cart clear)
    await orchestratePostPayment({
      orderId: order.id,
      userId: order.user_id,
      createdBy: req.user!.id,
      skipCouponIncrement: true, // coupon already incremented at initiate
    });

    // Caches already cleared by orchestration
    logAdmin({
      actorId: req.user!.id,
      action: 'payment_captured',
      targetType: 'payment',
      targetId: payment?.id || order.id,
      targetName: razorpay_payment_id,
      ip: getClientIp(req),
    });

    if (webhookRowId) await completeWebhookEvent(webhookRowId, { orderId: order.id, paymentId: payment?.id });
    return ok(res, { order_id: order.id, order_number: order.order_number, payment_id: payment?.id }, 'Payment verified successfully');
  } catch (e: any) {
    console.error('[CHECKOUT] verifyPayment error:', e);
    if (webhookRowId) {
      try { await failWebhookEvent(webhookRowId, e.message || 'unknown'); } catch { /* best-effort */ }
    }
    return err(res, e.message || 'Payment verification failed', 500);
  }
}

/**
 * POST /checkout/webhook
 * Razorpay webhook handler (no auth — uses webhook signature verification).
 * Handles: payment.captured, payment.failed, refund.created, refund.processed
 */
export async function handleWebhook(req: Request, res: Response) {
  let webhookRowId: number | null = null;
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    // Dedicated webhook secret ONLY (configured in the Razorpay dashboard).
    // The key secret signs checkout payloads, not webhooks — no fallback.
    const webhookSecret = config.razorpay.webhookSecret;
    if (!webhookSecret) {
      console.error('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET not configured — rejecting (fail-closed)');
      return res.status(401).json({ success: false, error: 'Webhook not configured' });
    }

    // Verify HMAC over the EXACT raw bytes Razorpay sent (captured by the
    // express.json `verify` hook in app.ts). Stringify fallback covers tests
    // that construct req without a raw buffer.
    const rawBody: string = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn('[WEBHOOK] Invalid signature');
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    // ── Idempotency gate ──
    // Razorpay supplies x-razorpay-event-id; fall back to a hash of payload.
    const headerEventId = (req.headers['x-razorpay-event-id'] as string) || '';
    const entity =
      payload?.payment?.entity ||
      payload?.refund?.entity ||
      payload?.order?.entity ||
      {};
    const eventId = headerEventId || fallbackEventId('razorpay', event, entity.id, entity.created_at);

    const registered = await beginWebhookEvent({
      provider: 'razorpay',
      eventId,
      eventType: event || 'unknown',
      rawBody,
      relatedType: payload?.payment ? 'payment' : payload?.refund ? 'refund' : 'order',
      relatedId: null,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });

    // Duplicate delivery: 200 OK so Razorpay stops retrying.
    if (!registered) {
      return res.status(200).json({ success: true, duplicate: true });
    }
    webhookRowId = registered.id;

    switch (event) {
      case 'payment.captured': {
        const rpPayment = payload.payment.entity;
        const rpOrderId = rpPayment.order_id;

        // Find our order
        const { data: order } = await supabase
          .from('orders')
          .select('*')
          .eq('razorpay_order_id', rpOrderId)
          .single();

        if (order && order.payment_status !== 'paid') {
          const amountInRupees = rpPayment.amount / 100;

          await supabase.from('orders').update({
            razorpay_payment_id: rpPayment.id,
            order_status: 'completed',
            payment_status: 'paid',
            payment_method: rpPayment.method || null,
            paid_at: new Date().toISOString(),
          }).eq('id', order.id);

          // Check if payment record exists, if not create one
          const { data: existingPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('razorpay_payment_id', rpPayment.id)
            .single();

          if (!existingPayment) {
            await supabase.from('payments').insert({
              order_id: order.id,
              user_id: order.user_id,
              razorpay_payment_id: rpPayment.id,
              razorpay_order_id: rpOrderId,
              amount: amountInRupees,
              currency: rpPayment.currency || config.razorpay.currency,
              payment_method: rpPayment.method || null,
              payment_status: 'captured',
              bank: rpPayment.bank || null,
              wallet: rpPayment.wallet || null,
              vpa: rpPayment.vpa || null,
              card_last4: rpPayment.card?.last4 || null,
              card_network: rpPayment.card?.network || null,
              card_type: rpPayment.card?.type || null,
              fee: rpPayment.fee ? rpPayment.fee / 100 : 0,
              tax: rpPayment.tax ? rpPayment.tax / 100 : 0,
              captured_at: new Date().toISOString(),
            });
          }

          // Run full post-payment orchestration
          await orchestratePostPayment({
            orderId: order.id,
            userId: order.user_id,
            createdBy: order.user_id,
            skipCouponIncrement: true, // coupon already incremented at initiate
          });
          // Caches already cleared by orchestration
        }
        break;
      }

      case 'payment.failed': {
        const rpPayment = payload.payment.entity;
        const rpOrderId = rpPayment.order_id;

        const { data: order } = await supabase
          .from('orders')
          .select('id, user_id')
          .eq('razorpay_order_id', rpOrderId)
          .single();

        if (order) {
          await supabase.from('orders').update({
            order_status: 'failed',
            payment_status: 'failed',
          }).eq('id', order.id);

          await supabase.from('payments').insert({
            order_id: order.id,
            user_id: order.user_id,
            razorpay_payment_id: rpPayment.id,
            razorpay_order_id: rpOrderId,
            amount: rpPayment.amount / 100,
            currency: rpPayment.currency || config.razorpay.currency,
            payment_method: rpPayment.method || null,
            payment_status: 'failed',
            error_code: rpPayment.error_code || null,
            error_description: rpPayment.error_description || null,
            error_source: rpPayment.error_source || null,
            error_step: rpPayment.error_step || null,
            error_reason: rpPayment.error_reason || null,
          });

          await clearOrderCaches();
        }
        break;
      }

      case 'refund.created':
      case 'refund.processed': {
        const rpRefund = payload.refund.entity;
        const rpPaymentId = rpRefund.payment_id;

        const { data: payment } = await supabase
          .from('payments')
          .select('id, order_id, user_id')
          .eq('razorpay_payment_id', rpPaymentId)
          .single();

        if (payment) {
          const refundAmount = rpRefund.amount / 100;
          const isFullRefund = rpRefund.amount === (payload.payment?.entity?.amount || 0);

          // Update payment refund tracking
          await supabase.from('payments').update({
            payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
            refund_amount: refundAmount,
            refunded_at: new Date().toISOString(),
          }).eq('id', payment.id);

          // Update order status
          await supabase.from('orders').update({
            payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
            order_status: isFullRefund ? 'refunded' : 'completed',
          }).eq('id', payment.order_id);

          // Update refund record if we have one with this razorpay_refund_id
          const refundStatus = event === 'refund.processed' ? 'completed' : 'processing';
          await supabase.from('refunds')
            .update({
              refund_status: refundStatus,
              processed_at: event === 'refund.processed' ? new Date().toISOString() : undefined,
              completed_at: event === 'refund.processed' ? new Date().toISOString() : undefined,
            })
            .eq('razorpay_refund_id', rpRefund.id);

          // Reverse instructor earnings on full refund
          if (isFullRefund && payment.order_id) {
            try {
              await reverseEarningsForOrder(payment.order_id, 'Full refund processed', 1);
            } catch (e) {
              console.error('[WEBHOOK] Earning reversal failed (non-fatal):', e);
            }
          }

          // Notify student about refund
          if (event === 'refund.processed' && payment.user_id) {
            try {
              await notifyRefundProcessed(payment.user_id, refundAmount, payment.order_id);
            } catch (e) {
              console.error('[WEBHOOK] Refund notification failed (non-fatal):', e);
            }
          }

          await clearOrderCaches();
        }
        break;
      }
    }

    // Mark event as processed
    if (webhookRowId) await completeWebhookEvent(webhookRowId);

    // Always return 200 to Razorpay
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('[WEBHOOK] Error:', e);
    // Record failure but still return 200 to prevent Razorpay retry storms
    // on our internal errors. The webhook_events row stays as 'failed' for
    // manual replay from /admin/webhook-events.
    if (webhookRowId) {
      try { await failWebhookEvent(webhookRowId, e.message || 'unknown'); } catch { /* best-effort */ }
    }
    return res.status(200).json({ success: true });
  }
}

/**
 * POST /checkout/refund
 * Admin-initiated refund.
 * Body: { order_id, payment_id, amount?, reason?, refund_type? }
 */
export async function processRefund(req: Request, res: Response) {
  try {
    const { order_id, payment_id, amount, reason, refund_type = 'full' } = req.body;

    if (!order_id) return err(res, 'order_id is required', 400);
    if (!payment_id) return err(res, 'payment_id is required', 400);

    // Fetch payment
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (!payment) return err(res, 'Payment not found', 404);
    if (!payment.razorpay_payment_id) return err(res, 'No Razorpay payment ID found', 400);
    if (payment.payment_status === 'refunded') return err(res, 'Payment already fully refunded', 400);

    const refundAmountRupees = amount || payment.amount;
    const refundAmountPaise = Math.round(refundAmountRupees * 100);

    // Initiate refund on Razorpay
    const { initiateRefund } = await import('../../services/razorpay.service');
    const rpRefund = await initiateRefund({
      paymentId: payment.razorpay_payment_id,
      amount: refund_type === 'partial' ? refundAmountPaise : undefined,
      notes: { order_id: String(order_id), reason: reason || '' },
      receipt: `RFD-${order_id}`,
    });

    // Create our refund record
    const { data: refund, error: refErr } = await supabase.from('refunds').insert({
      order_id,
      payment_id,
      user_id: payment.user_id,
      razorpay_refund_id: rpRefund.id,
      amount: refundAmountRupees,
      currency: payment.currency,
      refund_status: 'processing',
      refund_type: refund_type,
      reason: reason || null,
      requested_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: req.user!.id,
      created_by: req.user!.id,
    }).select('*').single();

    if (refErr) return err(res, refErr.message, 500);

    // Create transaction record for refund
    await supabase.from('transactions').insert({
      order_id,
      payment_id,
      user_id: payment.user_id,
      transaction_type: refund_type === 'partial' ? 'partial_refund' : 'refund',
      amount: refundAmountRupees,
      currency: payment.currency,
      description: `Refund for order #${order_id}: ${reason || 'Admin-initiated'}`,
      reference_type: 'refund',
      reference_id: refund?.id || null,
      razorpay_refund_id: rpRefund.id,
      razorpay_payment_id: payment.razorpay_payment_id,
      status: 'pending',
      created_by: req.user!.id,
    });

    await clearOrderCaches();
    logAdmin({
      actorId: req.user!.id,
      action: 'refund_created',
      targetType: 'refund',
      targetId: refund?.id || 0,
      targetName: rpRefund.id,
      ip: getClientIp(req),
    });

    return ok(res, refund, 'Refund initiated', 201);
  } catch (e: any) {
    console.error('[CHECKOUT] processRefund error:', e);
    return err(res, e.message || 'Refund failed', 500);
  }
}

/**
 * GET /checkout/config
 * Return Razorpay public key (for frontend checkout modal).
 */
export async function getCheckoutConfig(_req: Request, res: Response) {
  return ok(res, {
    razorpay_key_id: config.razorpay.keyId,
    currency: config.razorpay.currency,
  });
}

// Note: Enrollment creation logic is now in postPayment.service.ts
// which also handles bundle expansion, batch→course enrollment,
// GST calculation, student profile updates, and referral rewards.
