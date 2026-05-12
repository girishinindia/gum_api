import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

const COOLING_DAYS = 14; // Refund window — earnings stay pending for this long

/**
 * Earning Confirmation Job
 * ────────────────────────
 * Runs daily at 2:00 AM.
 * Confirms instructor earnings that have been pending beyond the cooling period
 * (14 days). This protects against refunds — once confirmed, the earning is
 * eligible for payout.
 */
export async function runEarningConfirmation(): Promise<{ confirmed: number; amount: number }> {
  const cutoff = new Date(Date.now() - COOLING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let confirmed = 0;
  let totalAmount = 0;

  // Find pending earnings older than the cooling period
  const { data: pending, error: err } = await supabase
    .from('instructor_earnings')
    .select('id, instructor_id, earning_amount')
    .eq('earning_status', 'pending')
    .eq('is_active', true)
    .lt('created_at', cutoff)
    .is('deleted_at', null)
    .limit(500);

  if (err) {
    logger.error({ err: err.message }, '[Cron:EarningConfirmation] Query failed');
    return { confirmed: 0, amount: 0 };
  }

  if (!pending || pending.length === 0) {
    logger.debug('[Cron:EarningConfirmation] No pending earnings past cooling period');
    return { confirmed: 0, amount: 0 };
  }

  const ids = pending.map((e: any) => e.id);
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('instructor_earnings')
    .update({ earning_status: 'confirmed', confirmed_at: now })
    .in('id', ids);

  if (updateErr) {
    logger.error({ err: updateErr.message }, '[Cron:EarningConfirmation] Update failed');
    return { confirmed: 0, amount: 0 };
  }

  confirmed = ids.length;
  totalAmount = pending.reduce((sum: number, e: any) => sum + parseFloat(e.earning_amount || 0), 0);

  // Group by instructor to send one notification per instructor
  const byInstructor = new Map<number, number>();
  for (const e of pending) {
    const curr = byInstructor.get(e.instructor_id) || 0;
    byInstructor.set(e.instructor_id, curr + parseFloat(e.earning_amount || 0));
  }

  for (const [instructorId, amount] of byInstructor) {
    try {
      await sendNotification({
        userId: instructorId,
        notificationType: 'earning_received',
        title: 'Earnings Confirmed',
        message: `Your earnings of ₹${amount.toFixed(2)} have been confirmed and are now available for payout.`,
        channels: ['in_app', 'email'],
        referenceType: 'instructor_earning',
      });
    } catch { /* notification failure shouldn't block job */ }
  }

  logger.info({ confirmed, totalAmount: totalAmount.toFixed(2), instructors: byInstructor.size }, '[Cron:EarningConfirmation] Completed');
  return { confirmed, amount: parseFloat(totalAmount.toFixed(2)) };
}
