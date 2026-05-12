import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Stale Cart Cleanup Job
 * ──────────────────────
 * Runs daily at 5:00 AM.
 * Soft-deletes cart_items that have been sitting untouched for 30+ days.
 * This keeps the cart table lean and prevents stale items from
 * holding up inventory or confusing returning users.
 */
const STALE_DAYS = 30;

export async function runStaleCartCleanup(): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Soft-delete stale cart items older than 30 days
  const { data, error: err } = await supabase
    .from('cart_items')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .is('deleted_at', null)
    .eq('is_active', true)
    .lt('created_at', cutoff)
    .select('id');

  if (err) {
    logger.error({ err: err.message }, '[Cron:CartCleanup] Cleanup failed');
    return { cleaned: 0 };
  }

  const cleaned = data?.length || 0;

  if (cleaned > 0) {
    logger.info({ cleaned, cutoff }, '[Cron:CartCleanup] Completed');
  } else {
    logger.debug('[Cron:CartCleanup] No stale cart items found');
  }

  return { cleaned };
}
