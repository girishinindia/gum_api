import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Coupon Deactivation Job
 * ───────────────────────
 * Runs every hour at :50.
 * Finds coupons that are still is_active = true but have:
 *   - valid_until < NOW() (date expired), OR
 *   - used_count >= usage_limit (fully redeemed)
 * Deactivates them so they stop appearing in validation.
 */
export async function runCouponDeactivation(): Promise<{ expired: number; exhausted: number }> {
  const now = new Date().toISOString();
  let expired = 0;
  let exhausted = 0;

  // 1. Deactivate date-expired coupons
  const { data: dateExpired, error: err1 } = await supabase
    .from('coupons')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('valid_until', 'is', null)
    .lt('valid_until', now)
    .is('deleted_at', null)
    .select('id');

  if (err1) {
    logger.error({ err: err1.message }, '[Cron:CouponDeact] Date-expiry update failed');
  } else {
    expired = dateExpired?.length || 0;
  }

  // 2. Deactivate usage-exhausted coupons
  // We need to find coupons where used_count >= usage_limit
  // Supabase doesn't support column-to-column comparison in filters,
  // so we fetch candidates and filter in JS
  const { data: candidates, error: err2 } = await supabase
    .from('coupons')
    .select('id, used_count, usage_limit')
    .eq('is_active', true)
    .not('usage_limit', 'is', null)
    .gt('usage_limit', 0)
    .is('deleted_at', null)
    .limit(500);

  if (err2) {
    logger.error({ err: err2.message }, '[Cron:CouponDeact] Usage query failed');
  } else if (candidates && candidates.length > 0) {
    const exhaustedIds = candidates
      .filter((c: any) => (c.used_count || 0) >= c.usage_limit)
      .map((c: any) => c.id);

    if (exhaustedIds.length > 0) {
      const { error: err3 } = await supabase
        .from('coupons')
        .update({ is_active: false })
        .in('id', exhaustedIds);

      if (err3) {
        logger.error({ err: err3.message }, '[Cron:CouponDeact] Usage-exhausted update failed');
      } else {
        exhausted = exhaustedIds.length;
      }
    }
  }

  if (expired > 0 || exhausted > 0) {
    logger.info({ expired, exhausted }, '[Cron:CouponDeact] Completed');
  } else {
    logger.debug('[Cron:CouponDeact] No coupons to deactivate');
  }

  return { expired, exhausted };
}
