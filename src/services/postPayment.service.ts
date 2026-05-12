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
import { redis } from '../config/redis';
import { createEarningsFromOrder, reverseEarningsForOrder } from './instructorEarning.service';
import {
  notifyEnrollmentConfirmed,
  notifyPaymentReceived,
  notifyInstructorEarning,
} from './notification.service';
import { creditWallet } from './wallet.service';

// ── Constants ──
const GST_RATE = 0.18; // 18% GST for digital services in India

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
    redis.del('student_profiles:all'),
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

  // 2. Calculate GST and update order
  const gstAmount = await calculateAndStoreGST(order);

  // 3. Create enrollments (handles bundles → all courses, batches → course)
  const enrollmentCount = await createEnrollmentsFromOrder(orderId, userId, orderItems, createdBy);

  // 4. Update student profile
  await updateStudentProfile(userId, order.total_amount, enrollmentCount);

  // 5. Increment coupon usage (if not already done)
  if (!params.skipCouponIncrement && order.coupon_id) {
    await incrementCouponUsage(order.coupon_id);
  }

  // 6. Increment promotion usage
  if (order.promotion_id) {
    await incrementPromotionUsage(order.promotion_id);
  }

  // 7. Process referral rewards
  const referralReward = await processReferralRewards(userId, orderId, order.total_amount);

  // 8. Create instructor earnings (revenue share)
  let instructorEarnings = 0;
  try {
    const earningResult = await createEarningsFromOrder(orderId, userId, gstAmount, createdBy);
    instructorEarnings = earningResult.totalEarnings;

    // 8b. Credit instructor wallets with their earnings
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
  } catch (e) {
    console.error('[POST-PAYMENT] Instructor earnings failed (non-fatal):', e);
  }

  // 9. Send notifications (non-blocking — failures don't affect payment)
  try {
    // Notify student: payment received
    await notifyPaymentReceived(userId, order.total_amount, orderId, createdBy);

    // Notify student: enrollment confirmed (get first course name)
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

    // Notify each instructor about their earning
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
          if (item) itemName = item[col];
        }
        await notifyInstructorEarning(earning.instructor_id, earning.earning_amount, itemName, orderId);
      }
    }
  } catch (e) {
    console.error('[POST-PAYMENT] Notification failed (non-fatal):', e);
  }

  // 10. Clear cart
  await supabase.from('cart_items').delete().eq('user_id', userId);

  // 11. Invalidate caches
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
// Student Profile Update
// ──────────────────────────────────────────────
async function updateStudentProfile(userId: number, totalAmountPaid: number, newEnrollments: number) {
  // Find student profile by user_id
  const { data: profile } = await supabase
    .from('student_profiles')
    .select('id, courses_enrolled, total_amount_paid')
    .eq('user_id', userId)
    .single();

  if (profile) {
    await supabase
      .from('student_profiles')
      .update({
        courses_enrolled: (profile.courses_enrolled || 0) + newEnrollments,
        total_amount_paid: Math.round(((profile.total_amount_paid || 0) + totalAmountPaid) * 100) / 100,
      })
      .eq('id', profile.id);
  }
  // If no student profile exists, that's OK — admin can create one later
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
  userId: number,
  orderId: number,
  orderTotal: number,
): Promise<boolean> {
  // Check if this user signed up with a referral code (via student_profiles.referred_by_user_id)
  const { data: profile } = await supabase
    .from('student_profiles')
    .select('id, referred_by_user_id, referral_code_used')
    .eq('user_id', userId)
    .single();

  if (!profile?.referral_code_used) return false;

  // Find the referral code record
  const { data: refCode } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('referral_code', profile.referral_code_used)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();

  if (!refCode) return false;

  // Check if we already created a usage record for this order
  const { data: existingUsage } = await supabase
    .from('referral_usages')
    .select('id')
    .eq('referral_code_id', refCode.id)
    .eq('referred_user_id', userId)
    .eq('order_id', orderId)
    .single();

  if (existingUsage) return false; // Already processed

  // Create referral usage record
  const { data: usage } = await supabase
    .from('referral_usages')
    .insert({
      referral_code_id: refCode.id,
      referred_user_id: userId,
      order_id: orderId,
      order_amount: orderTotal,
      usage_status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  // Calculate referrer reward
  let rewardAmount = 0;
  if (refCode.referrer_reward_type === 'percentage' && refCode.referrer_reward_percentage) {
    rewardAmount = orderTotal * (refCode.referrer_reward_percentage / 100);
    if (refCode.max_discount_amount && rewardAmount > refCode.max_discount_amount) {
      rewardAmount = refCode.max_discount_amount;
    }
  } else if (refCode.referrer_reward_type === 'fixed' && refCode.referrer_reward_amount) {
    rewardAmount = refCode.referrer_reward_amount;
  } else if (refCode.referrer_reward_type === 'credit' && refCode.referrer_reward_amount) {
    rewardAmount = refCode.referrer_reward_amount;
  }

  rewardAmount = Math.round(rewardAmount * 100) / 100;

  if (rewardAmount > 0 && usage) {
    // Create reward record for the referrer
    await supabase.from('referral_rewards').insert({
      referral_code_id: refCode.id,
      referral_usage_id: usage.id,
      reward_type: refCode.referrer_reward_type || 'credit',
      reward_amount: rewardAmount,
      reward_status: 'pending',
      is_active: true,
    });
  }

  // Update referral code stats
  await supabase
    .from('referral_codes')
    .update({
      usage_count: (refCode.usage_count || 0) + 1,
      total_referrals: (refCode.total_referrals || 0) + 1,
      successful_referrals: (refCode.successful_referrals || 0) + 1,
      total_earnings: Math.round(((refCode.total_earnings || 0) + rewardAmount) * 100) / 100,
    })
    .eq('id', refCode.id);

  return true;
}
