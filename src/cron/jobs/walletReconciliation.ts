import { db } from '../../services/db';
import { logger } from '../../utils/logger';

/**
 * Wallet Reconciliation Job
 * ─────────────────────────
 * Runs daily at 01:30 AM.
 *
 * For every wallet, compares the materialised `wallets.balance` against
 * SUM(signed wallet_transactions). Any non-zero drift is a bug or a stale
 * row from before Phase 2.2's atomic UDFs landed.
 *
 * What this job does:
 *   • Calls SQL helper fn_wallet_reconcile_check() (one round-trip)
 *   • Logs the count and the worst offenders
 *   • Does NOT auto-correct — drift is investigated manually first.
 *     Once we trust the data, future iterations can auto-heal by setting
 *     balance := computed_balance.
 *
 * The check is cheap because:
 *   • wallet_transactions has idx_wallet_txns_wallet
 *   • only wallets with drift are returned (WHERE balance <> computed)
 */
export async function runWalletReconciliation(): Promise<{
  total_wallets_with_drift: number;
  worst_drift: number;
  sample: Array<{ wallet_id: number; user_id: number; stored: number; computed: number; drift: number }>;
}> {
  let rows: any[] = [];
  try {
    rows = (await db.callFn('fn_wallet_reconcile_check')) as any[];
  } catch (e) {
    logger.error({ err: (e as Error).message }, '[Cron:WalletReconcile] RPC failed');
    return { total_wallets_with_drift: 0, worst_drift: 0, sample: [] };
  }
  rows = rows || [];
  const total = rows.length;

  if (total === 0) {
    logger.info('[Cron:WalletReconcile] ✓ All wallets reconciled — 0 drift');
    return { total_wallets_with_drift: 0, worst_drift: 0, sample: [] };
  }

  const sorted = rows
    .map((r) => ({
      wallet_id: Number(r.wallet_id),
      user_id: Number(r.user_id),
      stored: Number(r.stored_balance),
      computed: Number(r.computed_balance),
      drift: Number(r.drift),
    }))
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  const worst = sorted[0]?.drift || 0;
  const sample = sorted.slice(0, 20);

  logger.warn(
    { total, worst_drift: worst, sample },
    `[Cron:WalletReconcile] ⚠ ${total} wallet(s) show drift — investigate`,
  );

  return { total_wallets_with_drift: total, worst_drift: worst, sample };
}
