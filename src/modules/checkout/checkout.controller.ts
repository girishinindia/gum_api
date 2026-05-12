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

// ── Helper: resolve item price ──
async function resolveItemPrice(itemType: string, itemId: number): Promise<{ price: number; name: string; slug: string } | null> {
  let table = '';
  switch (itemType) {
    case 'course':  table = 'courses'; break;
    case 'bundle':  table = 'bundles'; break;
    case 'batch':   table = 'course_batches'; break;
    case 'webinar': table = 'webinars'; break;
    default: return null;
  }
  const { data } = await supabase
    .from(table)
    .select('id, name, slug, price, sale_price')
    .eq('id', itemId)
    .single();
  if (!data) return null;
  const price = data.sale_price && data.sale_price > 0 ? data.sale_price : (data.price || 0);
  return { price, name: data.name || data.slug, slug: data.slug || '' };
}

// ── Helper: apply coupon discount ──
async function applyCoupon(code: string, subtotal: number, items: any[]): Promise<{ valid: boolean; discount: number; couponId: number | null; message?: string }> {
  if (!code) return { valid: false, discount: 0, couponId: null };

  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();

  if (!coupon) return { valid: false, discount: 0, couponId: null, message: 'Invalid coupon code' };

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) return { valid: false, discount: 0, couponId: null, message: 'Coupon not yet active' };
  if (coupon.valid_until && new Date(coupon.valid_until) < now) return { valid: false, discount: 0, couponId: null, message: 'Coupon expired' };
  if (coupon.max_uses && coupon.times_used >= coupon.max_uses) return { valid: false, discount: 0, couponId: null, message: 'Coupon usage limit reached' };
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) return { valid: false, discount: 0, couponId: null, message: `Minimum order amount is ₹${coupon.min_order_amount}` };

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = subtotal * (coupon.discount_value / 100);
    if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
      discount = coupon.max_discount_amount;
    }
  } else {
    discount = coupon.discount_value;
  }

  discount = Math.min(discount, subtotal);
  return { valid: true, discount: Math.round(discount * 100) / 100, couponId: coupon.id };
}

/**
 * POST /checkout/initiate
 * Convert cart → order → Razorpay order.
 * Body: { user_id, coupon_code?, promo_code?, notes?, billing_* }
 */
export async function initiateCheckout(req: Request, res: Response) {
  try {
    const { user_id, coupon_code, promo_code, notes, billing_name, billing_email, billing_phone, billing_address, billing_city, billing_state, billing_country, billing_pincode, gst_number } = req.body;

    if (!user_id) return err(res, 'user_id is required', 400);

    // 1. Fetch active cart items for this user
    const { data: cartItems, error: cartErr } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', user_id)
      .is('deleted_at', null)
      .eq('is_active', true);

    if (cartErr) return err(res, cartErr.message, 500);
    if (!cartItems || cartItems.length === 0) return err(res, 'Cart is empty', 400);

    // 2. Resolve prices for each item
    const orderItems: any[] = [];
    let subtotal = 0;

    for (const ci of cartItems) {
      const resolved = await resolveItemPrice(ci.item_type, ci.item_id);
      if (!resolved) return err(res, `Item not found: ${ci.item_type} #${ci.item_id}`, 400);

      const itemTotal = resolved.price * (ci.quantity || 1);
      subtotal += itemTotal;

      orderItems.push({
        item_type: ci.item_type,
        item_id: ci.item_id,
        item_name: resolved.name,
        item_slug: resolved.slug,
        original_price: resolved.price,
        discount_amount: 0,
        tax_amount: 0,
        final_price: resolved.price,
        quantity: ci.quantity || 1,
      });
    }

    // 3. Apply coupon
    let discountAmount = 0;
    let couponId: number | null = null;
    if (coupon_code) {
      const couponResult = await applyCoupon(coupon_code, subtotal, orderItems);
      if (!couponResult.valid) return err(res, couponResult.message || 'Invalid coupon', 400);
      discountAmount = couponResult.discount;
      couponId = couponResult.couponId;
    }

    // 4. Apply promo code (instructor promotion)
    let promotionId: number | null = null;
    if (promo_code) {
      const { data: promo } = await supabase
        .from('instructor_promotions')
        .select('*')
        .eq('promo_code', promo_code.toUpperCase())
        .eq('is_active', true)
        .is('deleted_at', null)
        .single();
      if (promo) {
        promotionId = promo.id;
        // Promo discount is additive to coupon
        if (promo.discount_type === 'percentage') {
          const promoDisc = subtotal * (promo.discount_value / 100);
          discountAmount += Math.min(promoDisc, subtotal - discountAmount);
        } else {
          discountAmount += Math.min(promo.discount_value, subtotal - discountAmount);
        }
      }
    }

    const taxAmount = 0; // Tax can be added later (GST etc.)
    const totalAmount = Math.max(subtotal - discountAmount + taxAmount, 0);
    const totalRounded = Math.round(totalAmount * 100) / 100;

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
    const itemsToInsert = orderItems.map(oi => ({
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

    // 8. Increment coupon usage (for paid orders — free orders handled by orchestration)
    if (couponId && totalRounded > 0) {
      try {
        await supabase.rpc('increment_coupon_usage', { coupon_id_arg: couponId });
      } catch {
        // Fallback: manual increment
        const { data: c } = await supabase.from('coupons').select('times_used').eq('id', couponId).single();
        if (c) await supabase.from('coupons').update({ times_used: (c.times_used || 0) + 1 }).eq('id', couponId);
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
 * POST /checkout/verify
 * Verify Razorpay payment after checkout modal closes.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id }
 */
export async function verifyPayment(req: Request, res: Response) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return err(res, 'Missing Razorpay verification fields', 400);
    }

    // 1. Verify signature
    const isValid = verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!isValid) return err(res, 'Payment verification failed — invalid signature', 400);

    // 2. Fetch the Razorpay payment details
    const rpPayment = await fetchPayment(razorpay_payment_id);

    // 3. Find our order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (!order) return err(res, 'Order not found for this Razorpay order', 404);

    // Prevent double-processing
    if (order.payment_status === 'paid') {
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

    return ok(res, { order_id: order.id, order_number: order.order_number, payment_id: payment?.id }, 'Payment verified successfully');
  } catch (e: any) {
    console.error('[CHECKOUT] verifyPayment error:', e);
    return err(res, e.message || 'Payment verification failed', 500);
  }
}

/**
 * POST /checkout/webhook
 * Razorpay webhook handler (no auth — uses webhook signature verification).
 * Handles: payment.captured, payment.failed, refund.created, refund.processed
 */
export async function handleWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || config.razorpay.keySecret;

    // Verify webhook signature
    const rawBody = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn('[WEBHOOK] Invalid signature');
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

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

    // Always return 200 to Razorpay
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('[WEBHOOK] Error:', e);
    // Still return 200 to prevent Razorpay retries on our errors
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
