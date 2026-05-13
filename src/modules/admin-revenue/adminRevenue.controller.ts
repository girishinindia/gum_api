/**
 * Admin Revenue Controller (Phase 10.6)
 * ──────────────────────────────────────
 * Reads the v_revenue_daily materialised view that aggregates paid
 * orders by IST day. The view is refreshed nightly at 02:30 by the
 * `revenue-daily-refresh` cron job, but admins can force-refresh via
 * POST /admin/revenue/refresh.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { db, DbError } from '../../services/db';
import { ok, err } from '../../utils/response';
import { logger } from '../../utils/logger';

const querySchema = z.object({
  days: z
    .preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(366))
    .optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** GET /admin/revenue/daily?days=30 (or ?from=YYYY-MM-DD&to=YYYY-MM-DD) */
export async function dailyRevenue(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);

  const { days, from, to } = parsed.data;

  let q = supabase
    .from('v_revenue_daily')
    .select('day, orders_count, distinct_customers, gross_revenue, tax_collected, discount_total, net_revenue')
    .order('day', { ascending: false });

  if (from)               q = q.gte('day', from);
  if (to)                 q = q.lte('day', to);
  if (!from && !to)       q = q.limit(days ?? 30);

  const { data, error } = await q;
  if (error) return err(res, error.message, 500);

  // Roll-up totals for the returned window
  const totals = (data ?? []).reduce(
    (a, r: any) => ({
      orders_count:       a.orders_count       + Number(r.orders_count       ?? 0),
      distinct_customers: a.distinct_customers + Number(r.distinct_customers ?? 0),
      gross_revenue:      a.gross_revenue      + Number(r.gross_revenue      ?? 0),
      tax_collected:      a.tax_collected      + Number(r.tax_collected      ?? 0),
      discount_total:     a.discount_total     + Number(r.discount_total     ?? 0),
      net_revenue:        a.net_revenue        + Number(r.net_revenue        ?? 0),
    }),
    { orders_count: 0, distinct_customers: 0, gross_revenue: 0, tax_collected: 0, discount_total: 0, net_revenue: 0 },
  );

  return ok(res, { rows: data ?? [], totals, count: data?.length ?? 0 });
}

/** POST /admin/revenue/refresh — manually trigger MV refresh */
export async function refreshNow(_req: Request, res: Response) {
  const started = Date.now();
  try {
    await db.callFn('fn_refresh_revenue_daily');
  } catch (e) {
    logger.error({ err: e }, '[AdminRevenue] refresh failed');
    return err(res, e instanceof DbError ? e.message : 'refresh failed', 500);
  }
  return ok(res, { refreshed: true, duration_ms: Date.now() - started });
}
