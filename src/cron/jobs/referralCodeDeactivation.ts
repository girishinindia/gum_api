import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Referral Code Deactivation Job
 * ──────────────────────────────
 * Runs hourly at :55. Deactivates referral codes that are still
 * is_active = true but whose expires_at is in the past, so an expired code
 * stops being honored at signup/redemption and shows as inactive everywhere.
 * (The list/getById endpoints also report expired codes as inactive on read;
 * this job persists the flip for codes that are never viewed.)
 */
export async function runReferralCodeDeactivation(): Promise<{ expired: number }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('referral_codes')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    logger.error({ err: error.message }, '[Cron:ReferralDeact] Expiry update failed');
    return { expired: 0 };
  }
  const expired = data?.length || 0;
  if (expired > 0) logger.info({ expired }, '[Cron:ReferralDeact] Completed');
  else logger.debug('[Cron:ReferralDeact] No referral codes to deactivate');
  return { expired };
}
