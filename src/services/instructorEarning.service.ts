/**
 * Instructor Earning Service
 * ──────────────────────────
 * Calculates and records instructor revenue shares from sales.
 * Called by postPayment.service.ts after a successful payment.
 *
 * Revenue split logic:
 *  - Get instructor_id from the course/bundle/batch/webinar
 *  - Look up instructor_profiles for revenue_share_percentage (default 70%)
 *  - earning = (order_item_amount - proportional_gst) × share%
 *  - Store in instructor_earnings table
 *  - Update instructor_profiles aggregates
 */

import { supabase } from '../config/supabase';
import { redis } from '../config/redis';
import { resolveShare, type PayableItemType } from './revenueShare.service';

// ── Types ──
export interface EarningResult {
  totalEarnings: number;
  earningsCreated: number;
}

// ── Cache ──
async function clearEarningCaches() {
  await Promise.all([
    redis.del('instructor_earnings:all'),
    redis.del('instructor_profiles:all'),
  ]);
}

// ── Lookup instructor_id from item ──
async function getInstructorId(itemType: string, itemId: number): Promise<number | null> {
  let table: string;
  switch (itemType) {
    case 'course': table = 'courses'; break;
    case 'bundle': table = 'bundles'; break;
    case 'batch': table = 'course_batches'; break;
    case 'webinar': table = 'webinars'; break;
    default: return null;
  }

  const { data } = await supabase
    .from(table)
    .select('instructor_id')
    .eq('id', itemId)
    .single();

  return data?.instructor_id || null;
}

// ── Share percentage ──
// June 2026: resolved from `revenue_share_tiers` (student-count slabs with
// per-content-type / per-instructor overrides) via revenueShare.service.
// This REPLACES the legacy instructor_profiles.revenue_share_percentage.


// ══════════════════════════════════════════════════
// MAIN: Create earnings from an order
// ══════════════════════════════════════════════════

/**
 * Process all order items and create instructor earning records.
 * Called after payment confirmation.
 */
export async function createEarningsFromOrder(
  orderId: number,
  userId: number, // student who purchased
  gstAmount: number,
  createdBy: number,
): Promise<EarningResult> {
  // Fetch order + items
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, subtotal, discount_amount, coupon_discount_amount, promo_discount_amount, promotion_id, total_amount')
    .eq('id', orderId)
    .single();

  if (orderError) {
    console.error('[EARNINGS] Failed to fetch order:', orderError.message);
    throw new Error(`Failed to fetch order ${orderId}: ${orderError.message}`);
  }
  if (!order) return { totalEarnings: 0, earningsCreated: 0 };

  // NOTE: order_items columns are original_price / final_price (NOT unit_price / total_price).
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('id, item_type, item_id, original_price, final_price, quantity')
    .eq('order_id', orderId)
    .is('deleted_at', null);

  if (itemsError) {
    // Throw so withStep() records the step as failed (retryable) instead of
    // silently completing with zero earnings.
    console.error('[EARNINGS] Failed to fetch order items:', itemsError.message);
    throw new Error(`Failed to fetch order items for order ${orderId}: ${itemsError.message}`);
  }
  if (!orderItems || orderItems.length === 0) return { totalEarnings: 0, earningsCreated: 0 };

  let totalEarnings = 0;
  let earningsCreated = 0;

  // ── Revenue-share engine (June 2026) ──────────────────────────────────
  // Shares are computed on the FULL (undiscounted) amount; each party
  // absorbs only the discount IT gave:
  //   • promo_discount_amount  (instructor promo)  → instructor absorbs
  //   • coupon_discount_amount (platform coupon)   → system absorbs
  // Legacy orders predating the split columns treated their whole
  // discount_amount as system-given (coupons were the only source then).
  const couponDiscTotal = Number(order.coupon_discount_amount) || 0;
  const promoDiscTotal = Number(order.promo_discount_amount) || 0;
  const legacyResidual = Math.max(
    (Number(order.discount_amount) || 0) - couponDiscTotal - promoDiscTotal,
    0,
  );
  const systemDiscTotal = couponDiscTotal + legacyResidual;

  // Promo eligibility: the promotion's linked courses (empty set = all courses)
  let promoCourseIds = new Set<number>();
  if (promoDiscTotal > 0 && order.promotion_id) {
    const { data: pc } = await supabase
      .from('instructor_promotion_courses')
      .select('course_id')
      .eq('promotion_id', order.promotion_id)
      .eq('is_active', true)
      .is('deleted_at', null);
    promoCourseIds = new Set((pc || []).map((r: any) => Number(r.course_id)));
  }
  const isPromoEligible = (it: any) =>
    it.item_type === 'course' && (promoCourseIds.size === 0 || promoCourseIds.has(Number(it.item_id)));

  // Pass 1 — bases for prorating each discount + GST
  const grossOf = (it: any) =>
    (Number(it.original_price) || 0) * (Number(it.quantity) || 1);
  const couponBase = orderItems.reduce((s: number, it: any) => s + grossOf(it), 0);
  const promoBase = orderItems.reduce(
    (s: number, it: any) => s + (promoDiscTotal > 0 && isPromoEligible(it) ? grossOf(it) : 0),
    0,
  );
  const paidTotal = orderItems.reduce((s: number, it: any) => {
    const g = grossOf(it);
    const p = promoBase > 0 && isPromoEligible(it) ? promoDiscTotal * (g / promoBase) : 0;
    const c = couponBase > 0 ? systemDiscTotal * (g / couponBase) : 0;
    return s + Math.max(g - p - c, 0);
  }, 0);

  for (const item of orderItems) {
    // Skip if item_type not supported
    if (!['course', 'bundle', 'batch', 'webinar'].includes(item.item_type)) continue;

    // Get the instructor for this item
    const instructorId = await getInstructorId(item.item_type, item.item_id);
    if (!instructorId) continue; // No instructor assigned

    const grossItem = grossOf(item); // FULL amount — the share base
    const promoItem = promoBase > 0 && isPromoEligible(item)
      ? promoDiscTotal * (grossItem / promoBase) : 0;
    const couponItem = couponBase > 0 ? systemDiscTotal * (grossItem / couponBase) : 0;
    const paidItem = Math.max(grossItem - promoItem - couponItem, 0);

    // GST is charged on what was actually paid — prorate by paid share
    const itemGst = paidTotal > 0
      ? Math.round(((paidItem / paidTotal) * gstAmount) * 100) / 100
      : 0;

    // Tiered share for THIS instructor × content type (student-count slabs)
    const share = await resolveShare(instructorId, item.item_type as PayableItemType);
    const sharePercent = share.instructorSharePct;

    // Share base: full amount net of GST. Each side then absorbs its own discount.
    const netFull = Math.max(grossItem - itemGst, 0);
    const earningAmount = Math.max(
      Math.round((netFull * (sharePercent / 100) - promoItem) * 100) / 100,
      0,
    );
    const platformFee = Math.max(
      Math.round((netFull * ((100 - sharePercent) / 100) - couponItem) * 100) / 100,
      0,
    );
    const itemAmount = Math.round(grossItem * 100) / 100; // recorded order_amount = full amount

    // Check for existing earning (idempotency)
    const { data: existing } = await supabase
      .from('instructor_earnings')
      .select('id')
      .eq('order_id', orderId)
      .eq('order_item_id', item.id)
      .eq('instructor_id', instructorId)
      .single();

    if (existing) continue; // Already processed

    // Insert earning record
    await supabase.from('instructor_earnings').insert({
      instructor_id: instructorId,
      order_id: orderId,
      order_item_id: item.id,
      item_type: item.item_type,
      item_id: item.item_id,
      student_id: userId,
      order_amount: itemAmount,
      platform_fee: platformFee,
      gst_amount: itemGst,
      instructor_share: sharePercent,
      earning_amount: earningAmount,
      earning_status: 'pending',
      created_by: createdBy,
    });

    totalEarnings += earningAmount;
    earningsCreated++;

    // Update instructor_profiles aggregates
    await updateInstructorAggregates(instructorId, earningAmount);
  }

  await clearEarningCaches();
  return { totalEarnings, earningsCreated };
}


// ── Update instructor_profiles aggregates ──
async function updateInstructorAggregates(instructorUserId: number, earningDelta: number) {
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('id, total_earnings, pending_earnings')
    .eq('user_id', instructorUserId)
    .single();

  if (profile) {
    await supabase
      .from('instructor_profiles')
      .update({
        total_earnings: Math.round(((profile.total_earnings || 0) + earningDelta) * 100) / 100,
        pending_earnings: Math.round(((profile.pending_earnings || 0) + earningDelta) * 100) / 100,
      })
      .eq('id', profile.id);
  }
}


// ══════════════════════════════════════════════════
// REVERSE EARNINGS (on refund)
// ══════════════════════════════════════════════════

/**
 * Reverse all earnings for an order (called on refund).
 */
export async function reverseEarningsForOrder(
  orderId: number,
  reason: string,
  updatedBy: number,
): Promise<number> {
  const { data: earnings } = await supabase
    .from('instructor_earnings')
    .select('id, instructor_id, earning_amount, earning_status')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .in('earning_status', ['pending', 'confirmed']);

  if (!earnings || earnings.length === 0) return 0;

  let reversed = 0;

  for (const earning of earnings) {
    // Mark as reversed
    await supabase.from('instructor_earnings').update({
      earning_status: 'reversed',
      reversed_at: new Date().toISOString(),
      reversal_reason: reason,
      updated_by: updatedBy,
    }).eq('id', earning.id);

    // Deduct from instructor aggregates
    const { data: profile } = await supabase
      .from('instructor_profiles')
      .select('id, total_earnings, pending_earnings')
      .eq('user_id', earning.instructor_id)
      .single();

    if (profile) {
      await supabase
        .from('instructor_profiles')
        .update({
          total_earnings: Math.max(Math.round(((profile.total_earnings || 0) - earning.earning_amount) * 100) / 100, 0),
          pending_earnings: Math.max(Math.round(((profile.pending_earnings || 0) - earning.earning_amount) * 100) / 100, 0),
        })
        .eq('id', profile.id);
    }

    reversed++;
  }

  await clearEarningCaches();
  return reversed;
}


// ══════════════════════════════════════════════════
// CONFIRM EARNINGS (auto or manual)
// ══════════════════════════════════════════════════

/**
 * Confirm pending earnings (e.g., after refund window passes).
 */
export async function confirmEarnings(earningIds: number[], updatedBy: number): Promise<number> {
  let confirmed = 0;
  for (const id of earningIds) {
    const { data } = await supabase
      .from('instructor_earnings')
      .update({
        earning_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq('id', id)
      .eq('earning_status', 'pending')
      .select('id');

    if (data && data.length > 0) confirmed++;
  }
  await clearEarningCaches();
  return confirmed;
}


// ══════════════════════════════════════════════════
// MARK EARNINGS AS PAID (when payout settles)
// ══════════════════════════════════════════════════

/**
 * Mark confirmed earnings as paid when a payout settlement completes.
 */
export async function markEarningsAsPaid(
  earningIds: number[],
  payoutRequestId: number,
  updatedBy: number,
): Promise<number> {
  let paid = 0;
  for (const id of earningIds) {
    const { data } = await supabase
      .from('instructor_earnings')
      .update({
        earning_status: 'paid',
        paid_at: new Date().toISOString(),
        payout_request_id: payoutRequestId,
        updated_by: updatedBy,
      })
      .eq('id', id)
      .eq('earning_status', 'confirmed')
      .select('id, instructor_id, earning_amount');

    if (data && data.length > 0) {
      paid++;
      // Move from pending_earnings to total_paid_out
      const earning = data[0];
      const { data: profile } = await supabase
        .from('instructor_profiles')
        .select('id, pending_earnings, total_paid_out')
        .eq('user_id', earning.instructor_id)
        .single();

      if (profile) {
        await supabase
          .from('instructor_profiles')
          .update({
            pending_earnings: Math.max(Math.round(((profile.pending_earnings || 0) - earning.earning_amount) * 100) / 100, 0),
            total_paid_out: Math.round(((profile.total_paid_out || 0) + earning.earning_amount) * 100) / 100,
          })
          .eq('id', profile.id);
      }
    }
  }
  await clearEarningCaches();
  return paid;
}


// ══════════════════════════════════════════════════
// DASHBOARD HELPERS
// ══════════════════════════════════════════════════

/**
 * Get earnings summary for an instructor.
 */
export async function getInstructorEarningsSummary(instructorUserId: number) {
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('total_earnings, pending_earnings, total_paid_out, revenue_share_percentage')
    .eq('user_id', instructorUserId)
    .single();

  return {
    totalEarnings: profile?.total_earnings || 0,
    pendingEarnings: profile?.pending_earnings || 0,
    totalPaidOut: profile?.total_paid_out || 0,
    sharePercentage: profile?.revenue_share_percentage || 70,
  };
}
