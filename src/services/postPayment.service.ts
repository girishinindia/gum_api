/**
 * Post-Payment Orchestration Service
 * ─────────────────────────────────────
 * Handles everything that happens after a successful payment:
 *  1. Create enrollment records (course, bundle → all courses, batch → course)
 *  2. Calculate & store GST (18% for digital services in India)
 *  3. Update student_profiles (courses_enrolled, total_amount_paid)
 *  4. Increment coupon.times_used if a coupon was applied
 *  5. Increment instructor_promotions.used_count if a promo was applied
 *  6. Process referral rewards if the student used a referral code
 *  7. Create instructor earning records (revenue share)
 *  8. Send notifications (enrollment confirmed, payment received, instructor earning)
 *  9. Clear the user's cart
 */

import { supabase } from '../config/supabase';
import { db } from './db';
import { redis } from '../config/redis';
import { createEarningsFromOrder, reverseEarningsForOrder } from './instructorEarning.service';
import {
  notifyEnrollmentConfirmed,
  notifyPaymentReceived,
  notifyInstructorEarning,
} from './notification.service';
import { creditWallet } from './wallet.service';

// ── Constants ──
// GST REMOVED (June 2026 business decision): disabled by default (rate 0) so
// instructor earnings are computed on the full price. Set GST_RATE_PCT to re-enable.
const GST_RATE = Number(process.env.GST_RATE_PCT || 0) / 100;

// ──────────────────────────────────────────────
// Re-entrant step wrapper
//
// Each piece of post-payment work is gated on a (order_id, step_name) row.
// If the step is already 'completed' we skip; otherwise we run the work,
// then mark it completed. A crash mid-step leaves the row in 'running' —
// the next invocation re-runs it (each step is individually idempotent
// thanks to source-id-based uniqueness in wallet_transactions, enrollments,
// invoices, etc.).
// ──────────────────────────────────────────────
async function withStep<T>(
  orderId: number,
  stepName: string,
  fn: () => Promise<T>,
): Promise<{ skipped: boolean; result?: T }> {
  let claimRows: any;
  try {
    claimRows = await db.callFn('fn_claim_payment_step', {
      p_order_id: orderId,
      p_step_name: stepName,
    });
  } catch (claimErr: any) {
    console.error(`[POST-PAYMENT] Step claim failed (${stepName}):`, claimErr?.message);
    // If we can't claim, run the step anyway — each downstream piece is
    // independently idempotent. Better to over-run than to silently drop.
    const result = await fn();
    return { skipped: false, result };
  }

  const row = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (row && row.current_status === 'completed') {
    return { skipped: true };
  }

  try {
    const result = await fn();
    await db.callFn('fn_complete_payment_step', {
      p_order_id: orderId,
      p_step_name: stepName,
      p_result: null,
    });
    return { skipped: false, result };
  } catch (e: any) {
    try {
      await db.callFn('fn_fail_payment_step', {
        p_order_id: orderId,
        p_step_name: stepName,
        p_error: e?.message || 'unknown',
      });
    } catch { /* best-effort */ }
    throw e;
  }
}

// ── Cache invalidation ──
async function clearAllCaches() {
  await Promise.all([
    redis.del('orders:all'),
    redis.del('payments:all'),
    redis.del('transactions:all'),
    redis.del('invoices:all'),
    redis.del('enrollments:all'),
    redis.del('cart_items:all'),
    redis.del('referral_codes:all'),
    redis.del('referral_usages:all'),
    redis.del('referral_rewards:all'),
    redis.del('coupons:all'),
    redis.del('instructor_promotions:all'),
  ]);
}

// ──────────────────────────────────────────────
// MAIN: orchestratePostPayment
// ──────────────────────────────────────────────
export interface PostPaymentParams {
  orderId: number;
  userId: number;
  createdBy: number;
  /** If true, skip coupon/promo increment (already done at initiate) */
  skipCouponIncrement?: boolean;
}

export async function orchestratePostPayment(params: PostPaymentParams): Promise<{
  enrollments: number;
  gstAmount: number;
  referralReward: boolean;
  instructorEarnings: number;
}> {
  const { orderId, userId, createdBy } = params;

  // 1. Fetch order + order_items
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) throw new Error(`Order #${orderId} not found`);

  const { data: orderItems } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null);

  if (!orderItems || orderItems.length === 0) {
    throw new Error(`No order items found for order #${orderId}`);
  }

  // ── Every step below is re-entrant via withStep(). A second call (from
  //    webhook + verify racing, or an admin replay) skips completed steps.

  // 2. Calculate GST and update order
  const gstStep = await withStep(orderId, 'gst', () => calculateAndStoreGST(order));
  const gstAmount = (gstStep.result as number | undefined) ?? Number(order.tax_amount || 0);

  // 3. Create enrollments (handles bundles → all courses, batches → course)
  const enrollmentStep = await withStep(orderId, 'enrollments',
    () => createEnrollmentsFromOrder(orderId, userId, orderItems, createdBy));
  const enrollmentCount = (enrollmentStep.result as number | undefined) ?? 0;

  // 4. Update student profile
  await withStep(orderId, 'student_profile',
    () => updateStudentProfile(userId, order.total_amount, enrollmentCount));

  // 5. Increment coupon usage (if not already done)
  if (!params.skipCouponIncrement && order.coupon_id) {
    await withStep(orderId, 'coupon_increment', () => incrementCouponUsage(order.coupon_id));
  }

  // 6. Increment promotion usage
  if (order.promotion_id) {
    await withStep(orderId, 'promotion_increment', () => incrementPromotionUsage(order.promotion_id));
  }

  // 7. Process referral rewards
  const referralStep = await withStep(orderId, 'referral_rewards',
    () => processReferralRewards(userId, orderId, order.total_amount));
  const referralReward = (referralStep.result as boolean | undefined) ?? false;

  // 8. Create instructor earnings (revenue share)
  let instructorEarnings = 0;
  try {
    const earningStep = await withStep(orderId, 'instructor_earnings', async () => {
      const earningResult = await createEarningsFromOrder(orderId, userId, gstAmount, createdBy);
      return earningResult.totalEarnings;
    });
    instructorEarnings = (earningStep.result as number | undefined) ?? 0;

    // 8b. Credit instructor wallets — idempotent at the UDF level via
    //     (source_type='earning', source_id=orderId). A re-run is a no-op.
    await withStep(orderId, 'instructor_wallet_credits', async () => {
      const { data: earnings } = await supabase
        .from('instructor_earnings')
        .select('instructor_id, earning_amount')
        .eq('order_id', orderId)
        .is('deleted_at', null);
      if (earnings) {
        for (const earning of earnings) {
          await creditWallet({
            userId: earning.instructor_id,
            amount: Number(earning.earning_amount),
            sourceType: 'earning',
            sourceId: orderId,
            description: `Earning from order #${orderId}`,
            metadata: { order_id: orderId },
            createdBy,
          }).catch(e => console.error('[POST-PAYMENT] Wallet credit failed:', e));
        }
      }
      return earnings?.length || 0;
    });
  } catch (e) {
    console.error('[POST-PAYMENT] Instructor earnings failed (non-fatal):', e);
  }

  // 9. Notifications — wrapped so a transient SMS/email outage doesn't re-send.
  await withStep(orderId, 'notifications', async () => {
    try {
      await notifyPaymentReceived(userId, order.total_amount, orderId, createdBy);

      if (orderItems.length > 0) {
        const firstItem = orderItems[0];
        let courseName = 'your course';
        if (firstItem.item_type === 'course') {
          const { data: c } = await supabase.from('courses').select('name').eq('id', firstItem.item_id).single();
          if (c) courseName = c.name;
        } else if (firstItem.item_type === 'bundle') {
          const { data: b } = await supabase.from('bundles').select('name').eq('id', firstItem.item_id).single();
          if (b) courseName = b.name;
        }
        await notifyEnrollmentConfirmed(userId, courseName, orderId, createdBy);
      }

      const { data: earnings } = await supabase
        .from('instructor_earnings')
        .select('instructor_id, earning_amount, item_type, item_id')
        .eq('order_id', orderId)
        .is('deleted_at', null);

      if (earnings) {
        for (const earning of earnings) {
          let itemName = 'an item';
          const tableMap: Record<string, string> = { course: 'courses', bundle: 'bundles', batch: 'course_batches', webinar: 'webinars' };
          const nameCol: Record<string, string> = { course: 'name', bundle: 'name', batch: 'batch_name', webinar: 'title' };
          const tbl = tableMap[earning.item_type];
          const col = nameCol[earning.item_type];
          if (tbl && col) {
            const { data: item } = await supabase.from(tbl).select(col).eq('id', earning.item_id).single();
            if (item) itemName = (item as Record<string, any>)[col];
          }
          await notifyInstructorEarning(earning.instructor_id, earning.earning_amount, itemName, orderId);
        }
      }
      return true;
    } catch (e) {
      console.error('[POST-PAYMENT] Notification failed (non-fatal):', e);
      return false;
    }
  });

  // 10. Clear cart
  await withStep(orderId, 'clear_cart', async () => {
    await supabase.from('cart_items').delete().eq('user_id', userId);
    return true;
  });

  // 11. Invoice PDF (Phase 8.7) — fire-and-forget enqueue so a slow Puppeteer
  //     boot can't stall the checkout response. Idempotent at the queue layer
  //     (jobId='invoice:<orderId>') and at the service layer (returns existing
  //     URL when invoices.tax_invoice_no is already populated).
  await withStep(orderId, 'invoice_pdf', async () => {
    const { enqueueInvoicePdf } = await import('./pdfQueue.service');
    await enqueueInvoicePdf(orderId);
    return true;
  });

  // 12. Invalidate caches (cheap, not gated)
  await clearAllCaches();

  return { enrollments: enrollmentCount, gstAmount, referralReward, instructorEarnings };
}


// ──────────────────────────────────────────────
// GST Calculation
// ──────────────────────────────────────────────
async function calculateAndStoreGST(order: any): Promise<number> {
  // GST is 18% on digital services in India
  // tax_amount = subtotal_after_discount × 18%
  const taxableAmount = Math.max(order.subtotal - (order.discount_amount || 0), 0);
  const gstAmount = Math.round(taxableAmount * GST_RATE * 100) / 100;

  if (gstAmount > 0 && (order.tax_amount || 0) === 0) {
    const newTotal = Math.round((taxableAmount + gstAmount) * 100) / 100;

    await supabase
      .from('orders')
      .update({
        tax_amount: gstAmount,
        total_amount: newTotal,
      })
      .eq('id', order.id);

    // Also update the invoice if it exists
    await supabase
      .from('invoices')
      .update({
        tax_amount: gstAmount,
        total_amount: newTotal,
        gst_amount: gstAmount,
        cgst_amount: Math.round((gstAmount / 2) * 100) / 100,
        sgst_amount: Math.round((gstAmount / 2) * 100) / 100,
      })
      .eq('order_id', order.id);
  }

  return gstAmount;
}


// ──────────────────────────────────────────────
// Enrollment Creation (with bundle/batch expansion)
// ──────────────────────────────────────────────
async function createEnrollmentsFromOrder(
  orderId: number,
  userId: number,
  orderItems: any[],
  createdBy: number,
): Promise<number> {
  let totalEnrollments = 0;

  for (const item of orderItems) {
    switch (item.item_type) {
      case 'course': {
        await upsertEnrollment(userId, orderId, item.id, 'course', item.item_id, createdBy);
        totalEnrollments++;
        break;
      }

      case 'bundle': {
        // Enroll in the bundle itself
        await upsertEnrollment(userId, orderId, item.id, 'bundle', item.item_id, createdBy);
        totalEnrollments++;

        // Also enroll in ALL courses within this bundle
        const { data: bundleCourses } = await supabase
          .from('bundle_courses')
          .select('course_id')
          .eq('bundle_id', item.item_id)
          .is('deleted_at', null)
          .eq('is_active', true);

        if (bundleCourses && bundleCourses.length > 0) {
          for (const bc of bundleCourses) {
            await upsertEnrollment(userId, orderId, item.id, 'course', bc.course_id, createdBy);
            totalEnrollments++;
          }
        }
        break;
      }

      case 'batch': {
        // Enroll in the batch itself
        await upsertEnrollment(userId, orderId, item.id, 'batch', item.item_id, createdBy);
        totalEnrollments++;

        // Also enroll in the batch's parent course
        const { data: batch } = await supabase
          .from('course_batches')
          .select('course_id')
          .eq('id', item.item_id)
          .single();

        if (batch?.course_id) {
          await upsertEnrollment(userId, orderId, item.id, 'course', batch.course_id, createdBy);
          totalEnrollments++;
        }
        break;
      }

      case 'webinar': {
        await upsertEnrollment(userId, orderId, item.id, 'webinar', item.item_id, createdBy);
        totalEnrollments++;
        break;
      }

      default:
        console.warn(`[POST-PAYMENT] Unknown item_type: ${item.item_type}`);
    }
  }

  return totalEnrollments;
}

/** Insert or reactivate an enrollment record */
async function upsertEnrollment(
  userId: number,
  orderId: number,
  orderItemId: number | null,
  itemType: string,
  itemId: number,
  createdBy: number,
) {
  // Check if enrollment already exists (active or not)
  const { data: existing } = await supabase
    .from('enrollments')
    .select('id, enrollment_status')
    .eq('user_id', userId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .single();

  if (existing) {
    // Reactivate if cancelled/expired/suspended
    if (existing.enrollment_status !== 'active') {
      await supabase.from('enrollments').update({
        enrollment_status: 'active',
        order_id: orderId,
        order_item_id: orderItemId,
        is_active: true,
        deleted_at: null,
        enrolled_at: new Date().toISOString(),
        updated_by: createdBy,
      }).eq('id', existing.id);
    }
  } else {
    await supabase.from('enrollments').insert({
      user_id: userId,
      order_id: orderId,
      order_item_id: orderItemId,
      item_type: itemType,
      item_id: itemId,
      enrollment_status: 'active',
      enrolled_at: new Date().toISOString(),
      created_by: createdBy,
    });
  }
}


// ──────────────────────────────────────────────
// Student Profile Update (Phase 13 — removed)
// student_profiles table was dropped. Denormalised counters
// `courses_enrolled` and `total_amount_paid` are no longer maintained.
// If you ever need them, compute on-demand from the enrollments + orders tables.
// ──────────────────────────────────────────────
async function updateStudentProfile(_userId: number, _totalAmountPaid: number, _newEnrollments: number) {
  // intentionally no-op
}


// ──────────────────────────────────────────────
// Coupon Usage Increment
// ──────────────────────────────────────────────
async function incrementCouponUsage(couponId: number) {
  try {
    await supabase.rpc('increment_coupon_usage', { coupon_id_arg: couponId });
  } catch {
    // Fallback: manual increment
    const { data: coupon } = await supabase
      .from('coupons')
      .select('times_used')
      .eq('id', couponId)
      .single();
    if (coupon) {
      await supabase
        .from('coupons')
        .update({ times_used: (coupon.times_used || 0) + 1 })
        .eq('id', couponId);
    }
  }
}


// ──────────────────────────────────────────────
// Promotion Usage Increment
// ──────────────────────────────────────────────
async function incrementPromotionUsage(promotionId: number) {
  const { data: promo } = await supabase
    .from('instructor_promotions')
    .select('id, used_count')
    .eq('id', promotionId)
    .single();

  if (promo) {
    await supabase
      .from('instructor_promotions')
      .update({ used_count: (promo.used_count || 0) + 1 })
      .eq('id', promotionId);
  }
}


// ──────────────────────────────────────────────
// Referral Rewards
// ──────────────────────────────────────────────
async function processReferralRewards(
  _userId: number,
  _orderId: number,
  _orderTotal: number,
): Promise<boolean> {
  // Phase 13 — student_profiles (which held signup-time referral attribution
  // via `referred_by_user_id` and `referral_code_used`) is dropped. The
  // dedicated referral_codes / referral_usages / referral_rewards tables
  // are still in place but unused (0 rows). When the referral product
  // actually launches, reintroduce attribution as a column on `users`
  // (e.g. `signup_referral_code_id`) and rebuild this function around the
  // existing referral_usages insert/update flow.
  return false;
}
