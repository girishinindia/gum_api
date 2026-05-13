import { db } from '../../services/db';
import { logger } from '../../utils/logger';

/**
 * Phase 10.6 — Nightly refresh of the v_revenue_daily materialised view.
 *
 * Postgres function `fn_refresh_revenue_daily` is SECURITY DEFINER and
 * handles the first-population (REFRESH) vs. ongoing (REFRESH CONCURRENTLY)
 * distinction transparently, so this job stays a one-liner.
 */
export async function runRevenueDailyRefresh(): Promise<{ refreshed: boolean }> {
  const started = Date.now();
  await db.callFn('fn_refresh_revenue_daily');
  logger.info({ duration: Date.now() - started }, '[Cron][revenue-daily-refresh] OK');
  return { refreshed: true };
}
