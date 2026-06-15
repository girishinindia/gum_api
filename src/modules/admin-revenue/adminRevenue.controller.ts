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

/**
 * GET /admin/revenue/platform?days=30 (or ?from=YYYY-MM-DD&to=YYYY-MM-DD)
 *
 * The platform's OWN revenue — the system's cut after the instructor share and
 * after promo/coupon discounts. Aggregated from instructor_earnings, where
 * `platform_fee` already stores the post-discount system share per order item
 * and `earning_amount` the instructor's post-discount payout.
 */
export async function platformRevenue(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);
  const { days, from, to } = parsed.data;

  let q = supabase
    .from('instructor_earnings')
    .select('instructor_id, order_amount, earning_amount, platform_fee, gst_amount, earning_status, created_at')
    .is('deleted_at', null);

  if (from) q = q.gte('created_at', `${from}T00:00:00`);
  if (to)   q = q.lte('created_at', `${to}T23:59:59`);
  if (!from && !to) {
    const since = new Date();
    since.setDate(since.getDate() - (days ?? 30));
    q = q.gte('created_at', since.toISOString());
  }
  q = q.limit(100000);

  const { data, error } = await q;
  if (error) return err(res, error.message, 500);
  const rows = (data ?? []) as any[];
  const num = (v: any) => Number(v ?? 0);

  const totals = rows.reduce(
    (a, r) => ({
      gross:             a.gross + num(r.order_amount),
      instructor_payout: a.instructor_payout + num(r.earning_amount),
      platform_revenue:  a.platform_revenue + num(r.platform_fee),
      gst:               a.gst + num(r.gst_amount),
      count:             a.count + 1,
    }),
    { gross: 0, instructor_payout: 0, platform_revenue: 0, gst: 0, count: 0 },
  );
  // Amount given up to promo/coupon discounts = gross − GST − instructor payout − platform net.
  const discounts = Math.max(
    Math.round((totals.gross - totals.gst - totals.instructor_payout - totals.platform_revenue) * 100) / 100, 0,
  );

  // Platform revenue split by earning status (pending / confirmed / paid / reversed)
  const byStatus: Record<string, { platform_revenue: number; count: number }> = {};
  for (const r of rows) {
    const s = r.earning_status || 'unknown';
    (byStatus[s] ||= { platform_revenue: 0, count: 0 });
    byStatus[s].platform_revenue += num(r.platform_fee);
    byStatus[s].count += 1;
  }

  // Per-instructor breakdown (what the platform earned from each instructor)
  const perMap: Record<number, any> = {};
  for (const r of rows) {
    const id = r.instructor_id;
    if (id == null) continue;
    (perMap[id] ||= { instructor_id: id, gross: 0, instructor_payout: 0, platform_revenue: 0, count: 0 });
    perMap[id].gross += num(r.order_amount);
    perMap[id].instructor_payout += num(r.earning_amount);
    perMap[id].platform_revenue += num(r.platform_fee);
    perMap[id].count += 1;
  }
  const ids = Object.keys(perMap).map(Number);
  if (ids.length) {
    const { data: users } = await supabase.from('users').select('id, full_name, first_name, last_name').in('id', ids);
    if (users) for (const u of users as any[]) {
      if (!perMap[u.id]) continue;
      perMap[u.id].instructor_name =
        (u.full_name && u.full_name.trim())
        || [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
        || `Instructor #${u.id}`;
    }
  }
  const byInstructor = Object.values(perMap)
    .map((x: any) => ({ ...x, instructor_name: x.instructor_name || `Instructor #${x.instructor_id}` }))
    .sort((a: any, b: any) => b.platform_revenue - a.platform_revenue);

  return ok(res, { totals: { ...totals, discounts }, byStatus, byInstructor });
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
