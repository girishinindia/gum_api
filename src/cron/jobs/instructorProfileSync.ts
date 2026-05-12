import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Instructor Profile Sync Job
 * ────────────────────────────
 * Runs daily at 4:00 AM.
 * Recalculates total_earnings, pending_earnings, and total_paid_out
 * on instructor_profiles from the actual instructor_earnings and
 * payout_settlements data. Prevents drift between denormalized totals
 * and source-of-truth tables.
 */
export async function runInstructorProfileSync(): Promise<{ synced: number; drifted: number }> {
  let synced = 0;
  let drifted = 0;

  // Get all active instructor profiles
  const { data: profiles, error: err } = await supabase
    .from('instructor_profiles')
    .select('id, user_id, total_earnings, pending_earnings, total_paid_out')
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1000);

  if (err) {
    logger.error({ err: err.message }, '[Cron:InstructorSync] Profile query failed');
    return { synced: 0, drifted: 0 };
  }

  if (!profiles || profiles.length === 0) return { synced: 0, drifted: 0 };

  for (const profile of profiles) {
    try {
      // Calculate actual totals from earnings table
      const [totalRes, pendingRes, paidRes] = await Promise.all([
        // Total confirmed + paid earnings (everything that's not reversed)
        supabase
          .from('instructor_earnings')
          .select('earning_amount')
          .eq('instructor_id', profile.user_id)
          .in('earning_status', ['pending', 'confirmed', 'paid'])
          .is('deleted_at', null),
        // Pending earnings only
        supabase
          .from('instructor_earnings')
          .select('earning_amount')
          .eq('instructor_id', profile.user_id)
          .eq('earning_status', 'pending')
          .is('deleted_at', null),
        // Total paid out from completed settlements
        supabase
          .from('payout_settlements')
          .select('settled_amount')
          .eq('instructor_id', profile.user_id)
          .eq('settlement_status', 'completed')
          .is('deleted_at', null),
      ]);

      const calcTotal = (totalRes.data || []).reduce((s: number, r: any) => s + parseFloat(r.earning_amount || 0), 0);
      const calcPending = (pendingRes.data || []).reduce((s: number, r: any) => s + parseFloat(r.earning_amount || 0), 0);
      const calcPaidOut = (paidRes.data || []).reduce((s: number, r: any) => s + parseFloat(r.settled_amount || 0), 0);

      const currentTotal = parseFloat(profile.total_earnings || 0);
      const currentPending = parseFloat(profile.pending_earnings || 0);
      const currentPaidOut = parseFloat(profile.total_paid_out || 0);

      // Check if any value drifted (tolerance: ₹0.01)
      const hasDrift =
        Math.abs(calcTotal - currentTotal) > 0.01 ||
        Math.abs(calcPending - currentPending) > 0.01 ||
        Math.abs(calcPaidOut - currentPaidOut) > 0.01;

      if (hasDrift) {
        const { error: updateErr } = await supabase
          .from('instructor_profiles')
          .update({
            total_earnings: parseFloat(calcTotal.toFixed(2)),
            pending_earnings: parseFloat(calcPending.toFixed(2)),
            total_paid_out: parseFloat(calcPaidOut.toFixed(2)),
          })
          .eq('id', profile.id);

        if (updateErr) {
          logger.error({ err: updateErr.message, profileId: profile.id }, '[Cron:InstructorSync] Update failed');
        } else {
          drifted++;
          logger.debug({
            userId: profile.user_id,
            before: { total: currentTotal, pending: currentPending, paidOut: currentPaidOut },
            after: { total: calcTotal.toFixed(2), pending: calcPending.toFixed(2), paidOut: calcPaidOut.toFixed(2) },
          }, '[Cron:InstructorSync] Corrected drift');
        }
      }

      synced++;
    } catch (e: any) {
      logger.error({ err: e.message, profileId: profile.id }, '[Cron:InstructorSync] Profile sync error');
    }
  }

  logger.info({ synced, drifted }, '[Cron:InstructorSync] Completed');
  return { synced, drifted };
}
