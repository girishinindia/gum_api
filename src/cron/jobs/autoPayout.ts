import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

/**
 * Auto-Payout Job
 * ───────────────
 * Runs daily at 3:00 AM.
 * For instructors who have:
 *   - auto_payout_enabled = true
 *   - payout_day = today's day of month
 *   - wallet balance >= min_payout_amount
 * Creates a payout_request automatically.
 */
export async function runAutoPayout(): Promise<{ created: number; totalAmount: number }> {
  const today = new Date().getDate(); // 1-28
  let created = 0;
  let totalAmount = 0;

  // Find wallets eligible for auto-payout today
  const { data: wallets, error: err } = await supabase
    .from('wallets')
    .select('id, user_id, balance, min_payout_amount, payout_method, payout_details')
    .eq('auto_payout_enabled', true)
    .eq('payout_day', today)
    .eq('is_frozen', false)
    .is('deleted_at', null)
    .limit(200);

  if (err) {
    logger.error({ err: err.message }, '[Cron:AutoPayout] Wallet query failed');
    return { created: 0, totalAmount: 0 };
  }

  if (!wallets || wallets.length === 0) {
    logger.debug({ today }, '[Cron:AutoPayout] No eligible wallets for today');
    return { created: 0, totalAmount: 0 };
  }

  for (const wallet of wallets) {
    const balance = parseFloat(wallet.balance || 0);
    const minAmount = parseFloat(wallet.min_payout_amount || 500);

    if (balance < minAmount) {
      logger.debug({ userId: wallet.user_id, balance, minAmount }, '[Cron:AutoPayout] Balance below minimum');
      continue;
    }

    // Check no pending/processing payout already exists for this instructor
    const { data: existingReq } = await supabase
      .from('payout_requests')
      .select('id')
      .eq('instructor_id', wallet.user_id)
      .in('request_status', ['pending', 'approved', 'processing'])
      .is('deleted_at', null)
      .maybeSingle();

    if (existingReq) {
      logger.debug({ userId: wallet.user_id }, '[Cron:AutoPayout] Existing pending request — skipping');
      continue;
    }

    // Generate request number: PAY-YYYYMMDD-USERID
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const requestNumber = `PAY-${dateStr}-${wallet.user_id}`;

    // Count confirmed (unpaid) earnings for this instructor
    const { count: earningCount } = await supabase
      .from('instructor_earnings')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', wallet.user_id)
      .eq('earning_status', 'confirmed')
      .is('deleted_at', null);

    // Create payout request
    const { data: request, error: insertErr } = await supabase
      .from('payout_requests')
      .insert({
        instructor_id: wallet.user_id,
        request_number: requestNumber,
        requested_amount: balance,
        payment_method: wallet.payout_method || 'bank_transfer',
        bank_details: wallet.payout_details || {},
        total_orders: earningCount || 0,
        metadata: { auto_generated: true, wallet_id: wallet.id },
      })
      .select('id, request_number')
      .single();

    if (insertErr) {
      logger.error({ err: insertErr.message, userId: wallet.user_id }, '[Cron:AutoPayout] Insert failed');
      continue;
    }

    created++;
    totalAmount += balance;

    // Notify instructor
    try {
      await sendNotification({
        userId: wallet.user_id,
        notificationType: 'payout_approved',
        title: 'Auto-Payout Request Created',
        message: `An automatic payout request for ₹${balance.toFixed(2)} has been created (${requestNumber}). It will be reviewed shortly.`,
        channels: ['in_app', 'email'],
        referenceType: 'payout_request',
        referenceId: request.id,
      });
    } catch { /* skip */ }
  }

  logger.info({ created, totalAmount: totalAmount.toFixed(2), eligibleWallets: wallets.length }, '[Cron:AutoPayout] Completed');
  return { created, totalAmount: parseFloat(totalAmount.toFixed(2)) };
}
