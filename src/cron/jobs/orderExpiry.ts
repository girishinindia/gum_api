import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Order Expiry Job
 * ────────────────
 * Runs hourly. Cancels pending orders past their expires_at.
 */
export async function runOrderExpiry(): Promise<{ cancelled: number }> {
  const now = new Date().toISOString();

  const { data: expired, error: err } = await supabase
    .from('orders')
    .select('id, order_number, user_id')
    .eq('order_status', 'pending')
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .is('deleted_at', null)
    .limit(500);

  if (err) {
    logger.error({ err: err.message }, '[Cron:OrderExpiry] Query failed');
    return { cancelled: 0 };
  }

  if (!expired || expired.length === 0) {
    logger.debug('[Cron:OrderExpiry] No expired orders found');
    return { cancelled: 0 };
  }

  const ids = expired.map((o: any) => o.id);

  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      order_status: 'cancelled',
      notes: 'Auto-cancelled: payment window expired',
    })
    .in('id', ids);

  if (updateErr) {
    logger.error({ err: updateErr.message }, '[Cron:OrderExpiry] Update failed');
    return { cancelled: 0 };
  }

  logger.info({ cancelled: ids.length, orderNumbers: expired.map((o: any) => o.order_number) }, '[Cron:OrderExpiry] Completed');
  return { cancelled: ids.length };
}
