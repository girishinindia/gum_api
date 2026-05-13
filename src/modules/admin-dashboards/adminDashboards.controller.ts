/**
 * Admin Dashboards Controller (Phase 14)
 * ──────────────────────────────────────
 * One endpoint per management dashboard, each returning everything that
 * dashboard needs in a single round-trip. Designed to be cheap (mostly
 * COUNT + recent-rows queries) and predictable.
 *
 *   GET /admin/dashboards/executive
 *   GET /admin/dashboards/sales       ?days=30
 *   GET /admin/dashboards/finance     ?days=30
 *   GET /admin/dashboards/operations
 *   GET /admin/dashboards/catalog
 *   GET /admin/dashboards/engagement  ?days=30
 *
 * Each returns: { kpis, trend, tables, meta } so the DashboardShell
 * frontend component can render with one shape.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { logger } from '../../utils/logger';

const daysQuerySchema = z.object({
  days: z
    .preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(366))
    .optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────
async function countActive(table: string, extra: Record<string, any> = {}): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

async function countSince(table: string, column: string, sinceIso: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte(column, sinceIso);
  return count ?? 0;
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/**
 * Swallow errors from an awaited Supabase / RPC call and return a sane
 * empty default. The Supabase builders are PromiseLike, not Promise, so
 * we can't `.catch()` them inline — this helper makes the call uniform.
 */
async function safeAwait<T>(fn: () => PromiseLike<{ data: T | null; error: any }>, fallback: T): Promise<T> {
  try {
    const r = await fn();
    if ((r as any).error) return fallback;
    return ((r as any).data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

// ════════════════════════════════════════════════════════════════
// 1. EXECUTIVE OVERVIEW
// ════════════════════════════════════════════════════════════════
export async function executive(_req: Request, res: Response) {
  try {
    const since24h = nDaysAgo(1);
    const since30d = nDaysAgo(30);
    const monthIso = monthStart();
    const todayIso = todayStart();

    // ── KPIs ──
    const [
      revenueTodayRow,
      revenueMtdRow,
      ordersToday,
      enrollmentsToday,
      activeUsers30d,
      pendingPayouts,
      openTickets,
    ] = await Promise.all([
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid').gte('paid_at', todayIso),
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid').gte('paid_at', monthIso),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('last_login_at', since30d).is('deleted_at', null),
      supabase.from('payout_requests').select('id, requested_amount', { count: 'exact' }).eq('status', 'pending').is('deleted_at', null),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).neq('status', 'closed').is('deleted_at', null),
    ]);

    const revenueToday = (revenueTodayRow.data ?? []).reduce((a: number, r: any) => a + Number(r.total_amount ?? 0), 0);
    const revenueMtd   = (revenueMtdRow.data   ?? []).reduce((a: number, r: any) => a + Number(r.total_amount ?? 0), 0);
    const pendingPayoutAmount = (pendingPayouts.data ?? []).reduce((a: number, r: any) => a + Number(r.requested_amount ?? 0), 0);

    // ── 30-day trend ──
    const { data: trend30 } = await supabase
      .from('v_revenue_daily')
      .select('day, orders_count, gross_revenue, net_revenue')
      .gte('day', since30d.slice(0, 10))
      .order('day', { ascending: true });

    // ── Attention tables ──
    const [topCoursesRows, failedCrons, queueErrors] = await Promise.all([
      safeAwait<any[]>(() => supabase.rpc('fn_top_courses_last_7d'), []),
      safeAwait<any[]>(() => supabase.from('cron_run_log').select('name, last_error, last_run').not('last_error', 'is', null).order('last_run', { ascending: false }).limit(5), []),
      safeAwait<any[]>(() => supabase.from('webhook_events').select('provider, event_type, status, occurred_at, error').neq('status', 'completed').order('occurred_at', { ascending: false }).limit(5), []),
    ]);

    return ok(res, {
      kpis: {
        revenue_today:        revenueToday,
        revenue_mtd:          revenueMtd,
        orders_today:         ordersToday.count ?? 0,
        enrollments_today:    enrollmentsToday.count ?? 0,
        active_users_30d:     activeUsers30d.count ?? 0,
        pending_payouts_count:pendingPayouts.count ?? 0,
        pending_payouts_inr:  pendingPayoutAmount,
        open_tickets:         openTickets.count ?? 0,
      },
      trend: { revenue_daily: trend30 ?? [] },
      tables: {
        top_courses_7d:        topCoursesRows,
        recent_failed_crons:   failedCrons,
        recent_webhook_errors: queueErrors,
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (e: any) {
    logger.error({ err: e }, '[AdminDashboards] executive failed');
    return err(res, e?.message ?? 'failed', 500);
  }
}

// ════════════════════════════════════════════════════════════════
// 2. SALES & REVENUE
// ════════════════════════════════════════════════════════════════
export async function sales(req: Request, res: Response) {
  const parsed = daysQuerySchema.safeParse(req.query);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);
  const days = parsed.data.days ?? 30;

  try {
    const todayIso = todayStart();
    const sinceWindow = nDaysAgo(days);
    const since30d = nDaysAgo(30);

    const [todayPaid, todayOrders, todayRefunds, paidLast30d, allOrdersLast30d, trend, failedPaymentsRows, recentRefunds, topCourses] = await Promise.all([
      supabase.from('orders').select('total_amount, tax_amount').eq('payment_status', 'paid').gte('paid_at', todayIso),
      supabase.from('orders').select('id, payment_status', { count: 'exact' }).gte('created_at', todayIso).limit(50).order('created_at', { ascending: false }),
      supabase.from('refunds').select('refund_amount').gte('created_at', todayIso),
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid').gte('paid_at', since30d),
      supabase.from('orders').select('id, payment_status', { count: 'exact', head: true }).gte('created_at', since30d),
      supabase.from('v_revenue_daily').select('day, orders_count, gross_revenue, net_revenue, tax_collected').gte('day', sinceWindow.slice(0, 10)).order('day', { ascending: true }),
      supabase.from('payments').select('id, amount, error_description, created_at, order_id').eq('payment_status', 'failed').gte('created_at', nDaysAgo(2)).order('created_at', { ascending: false }).limit(10),
      supabase.from('refunds').select('id, refund_amount, reason, status, created_at, order_id').order('created_at', { ascending: false }).limit(10),
      safeAwait<any[]>(() => supabase.rpc('fn_top_courses_last_7d'), []),
    ]);

    const grossToday = (todayPaid.data ?? []).reduce((a: number, r: any) => a + Number(r.total_amount ?? 0), 0);
    const taxToday   = (todayPaid.data ?? []).reduce((a: number, r: any) => a + Number(r.tax_amount   ?? 0), 0);
    const refundsTodayInr = (todayRefunds.data ?? []).reduce((a: number, r: any) => a + Number(r.refund_amount ?? 0), 0);

    const paid30d = (paidLast30d.data ?? []);
    const grossLast30 = paid30d.reduce((a: number, r: any) => a + Number(r.total_amount ?? 0), 0);
    const aovLast30   = paid30d.length > 0 ? grossLast30 / paid30d.length : 0;

    const totalOrders30d = allOrdersLast30d.count ?? 0;
    const refundRate30d  = totalOrders30d > 0 ? (paid30d.length > 0 ? 0 : 0) : 0;
    // refund rate = refunds in last 30d / paid orders in last 30d
    const { count: refundsLast30dCount } = await supabase
      .from('refunds').select('id', { count: 'exact', head: true }).gte('created_at', since30d);
    const refundRate = paid30d.length > 0 ? (refundsLast30dCount ?? 0) / paid30d.length : 0;

    return ok(res, {
      kpis: {
        revenue_today_gross:  grossToday,
        revenue_today_net:    grossToday - taxToday,
        revenue_today_tax:    taxToday,
        orders_today:         todayOrders.count ?? 0,
        refunds_today_inr:    refundsTodayInr,
        aov_30d:              aovLast30,
        refund_rate_30d_pct:  Math.round(refundRate * 10000) / 100,   // % with 2 decimals
      },
      trend: { daily: trend.data ?? [] },
      tables: {
        todays_orders:    todayOrders.data ?? [],
        failed_payments:  failedPaymentsRows.data ?? [],
        recent_refunds:   recentRefunds.data ?? [],
        top_courses_7d:   topCourses,
      },
      meta: { window_days: days, generated_at: new Date().toISOString() },
    });
  } catch (e: any) {
    logger.error({ err: e }, '[AdminDashboards] sales failed');
    return err(res, e?.message ?? 'failed', 500);
  }
}

// ════════════════════════════════════════════════════════════════
// 3. INSTRUCTOR PAYOUTS & FINANCE
// ════════════════════════════════════════════════════════════════
export async function finance(_req: Request, res: Response) {
  try {
    const monthIso = monthStart();
    const fyStartMonth = new Date(); fyStartMonth.setMonth(3, 1); fyStartMonth.setHours(0, 0, 0, 0);
    if (new Date().getMonth() < 3) fyStartMonth.setFullYear(fyStartMonth.getFullYear() - 1);
    const fyStartIso = fyStartMonth.toISOString();

    const [pendingRequests, settlementsMtd, tdsThisFy, walletAggregate, frozenWallets, recentSettlements, topEarnersRpc] = await Promise.all([
      supabase.from('payout_requests').select('id, requested_amount, requested_at, instructor_id', { count: 'exact' }).eq('status', 'pending').is('deleted_at', null).order('requested_at', { ascending: true }).limit(10),
      supabase.from('payout_settlements').select('gross_amount, tds_amount').eq('status', 'paid').gte('settled_at', monthIso),
      supabase.from('payout_settlements').select('tds_amount').gte('settled_at', fyStartIso),
      supabase.from('wallets').select('balance').is('deleted_at', null),
      supabase.from('wallets').select('id, user_id, balance, is_frozen').eq('is_frozen', true).limit(10),
      supabase.from('payout_settlements').select('id, instructor_id, gross_amount, tds_amount, settled_at, status').order('settled_at', { ascending: false }).limit(10),
      safeAwait<any[]>(() => supabase.rpc('fn_top_earning_instructors'), []),
    ]);

    const settledMtdInr = (settlementsMtd.data ?? []).reduce((a: number, r: any) => a + Number(r.gross_amount ?? 0), 0);
    const tdsMtdInr     = (settlementsMtd.data ?? []).reduce((a: number, r: any) => a + Number(r.tds_amount   ?? 0), 0);
    const tdsFyInr      = (tdsThisFy.data       ?? []).reduce((a: number, r: any) => a + Number(r.tds_amount   ?? 0), 0);

    const wallets = walletAggregate.data ?? [];
    const systemWalletBalance = wallets.reduce((a: number, r: any) => a + Number(r.balance ?? 0), 0);
    const positiveWallets = wallets.filter((r: any) => Number(r.balance ?? 0) > 0).length;

    // 30-day payout trend
    const sinceWindow = nDaysAgo(30);
    const { data: trend } = await supabase
      .from('payout_settlements')
      .select('settled_at, gross_amount, tds_amount')
      .gte('settled_at', sinceWindow)
      .eq('status', 'paid')
      .order('settled_at', { ascending: true });

    return ok(res, {
      kpis: {
        pending_payout_requests: pendingRequests.count ?? 0,
        settled_mtd_inr:         settledMtdInr,
        tds_mtd_inr:             tdsMtdInr,
        tds_fy_inr:              tdsFyInr,
        system_wallet_balance:   systemWalletBalance,
        wallets_with_balance:    positiveWallets,
      },
      trend: { payouts_daily: trend ?? [] },
      tables: {
        pending_approvals:  pendingRequests.data ?? [],
        recent_settlements: recentSettlements.data ?? [],
        frozen_wallets:     frozenWallets.data ?? [],
        top_earners:        topEarnersRpc,
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (e: any) {
    logger.error({ err: e }, '[AdminDashboards] finance failed');
    return err(res, e?.message ?? 'failed', 500);
  }
}

// ════════════════════════════════════════════════════════════════
// 4. OPERATIONS & SYSTEM HEALTH
// ════════════════════════════════════════════════════════════════
export async function operations(_req: Request, res: Response) {
  try {
    const since24h = nDaysAgo(1);

    const [openTickets, breachedSlas, ticketsToday, failedWebhooks, recentSystemErrors, oldestOpenTickets, adminLogs] = await Promise.all([
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).neq('status', 'closed').is('deleted_at', null),
      supabase.from('support_tickets').select('id, ticket_number, priority_id, created_at, status', { count: 'exact' }).neq('status', 'closed').lt('created_at', nDaysAgo(2)).order('created_at', { ascending: true }).limit(10),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      supabase.from('webhook_events').select('id, provider, event_type, status, occurred_at, error').neq('status', 'completed').gte('occurred_at', since24h).order('occurred_at', { ascending: false }).limit(10),
      supabase.from('activity_logs').select('id, action, message, level, created_at').eq('level', 'error').gte('created_at', since24h).order('created_at', { ascending: false }).limit(10),
      supabase.from('support_tickets').select('id, ticket_number, subject, priority_id, created_at').neq('status', 'closed').order('created_at', { ascending: true }).limit(5),
      supabase.from('activity_logs').select('id, action, actor_id, target_type, target_name, created_at').not('actor_id', 'is', null).order('created_at', { ascending: false }).limit(10),
    ]);

    return ok(res, {
      kpis: {
        open_tickets:           openTickets.count ?? 0,
        tickets_today:          ticketsToday.count ?? 0,
        breached_slas:          breachedSlas.count ?? 0,
        failed_webhooks_24h:    failedWebhooks.data?.length ?? 0,
        system_errors_24h:      recentSystemErrors.data?.length ?? 0,
      },
      trend: null,
      tables: {
        oldest_open_tickets:    oldestOpenTickets.data ?? [],
        breached_slas:          breachedSlas.data ?? [],
        failed_webhooks:        failedWebhooks.data ?? [],
        recent_admin_actions:   adminLogs.data ?? [],
        recent_system_errors:   recentSystemErrors.data ?? [],
      },
      meta: { generated_at: new Date().toISOString(), note: 'Queue + cron stats are read from BullMQ/Redis on the /admin/queues and /admin/scheduled-jobs pages — not duplicated here to keep this endpoint Postgres-only.' },
    });
  } catch (e: any) {
    logger.error({ err: e }, '[AdminDashboards] operations failed');
    return err(res, e?.message ?? 'failed', 500);
  }
}

// ════════════════════════════════════════════════════════════════
// 5. CATALOG & CONTENT
// ════════════════════════════════════════════════════════════════
export async function catalog(_req: Request, res: Response) {
  try {
    const since30d = nDaysAgo(30);
    const since7d = nDaysAgo(7);

    const [coursesPublished, coursesDraft, pendingInstructorApprovals, totalQuestions, upcomingWebinars, upcomingLiveClasses, draftsOlder7d, coursesNoQa, coursePublishTrend] = await Promise.all([
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('course_status', 'published').is('deleted_at', null),
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('course_status', 'draft').is('deleted_at', null),
      supabase.from('instructor_profiles').select('id, user_id, instructor_code, created_at', { count: 'exact' }).eq('approval_status', 'pending').is('deleted_at', null).order('created_at', { ascending: true }).limit(10),
      supabase.from('mcq_questions').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('webinars').select('id, name, start_at', { count: 'exact' }).gt('start_at', new Date().toISOString()).is('deleted_at', null).order('start_at', { ascending: true }).limit(10),
      supabase.from('live_sessions').select('id, session_title, scheduled_at', { count: 'exact' }).gt('scheduled_at', new Date().toISOString()).is('deleted_at', null).order('scheduled_at', { ascending: true }).limit(10),
      supabase.from('courses').select('id, name, slug, created_at').eq('course_status', 'draft').lt('created_at', since7d).is('deleted_at', null).order('created_at', { ascending: true }).limit(10),
      supabase.from('courses').select('id, name, slug').is('deleted_at', null).eq('course_status', 'published').limit(50),
      supabase.from('courses').select('created_at').is('deleted_at', null).gte('created_at', since30d),
    ]);

    // Build a simple 30-day publish trend bucket
    const trendMap = new Map<string, number>();
    for (const r of coursePublishTrend.data ?? []) {
      const day = String(r.created_at).slice(0, 10);
      trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
    }
    const trend = Array.from(trendMap.entries()).sort().map(([day, count]) => ({ day, courses_created: count }));

    return ok(res, {
      kpis: {
        courses_published:           coursesPublished.count ?? 0,
        courses_draft:               coursesDraft.count ?? 0,
        pending_instructor_approvals:pendingInstructorApprovals.count ?? 0,
        total_mcq_questions:         totalQuestions.count ?? 0,
        upcoming_webinars:           upcomingWebinars.count ?? 0,
        upcoming_live_classes:       upcomingLiveClasses.count ?? 0,
      },
      trend: { courses_created_daily: trend },
      tables: {
        drafts_older_7d:              draftsOlder7d.data ?? [],
        pending_instructor_approvals: pendingInstructorApprovals.data ?? [],
        upcoming_webinars:            upcomingWebinars.data ?? [],
        upcoming_live_classes:        upcomingLiveClasses.data ?? [],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (e: any) {
    logger.error({ err: e }, '[AdminDashboards] catalog failed');
    return err(res, e?.message ?? 'failed', 500);
  }
}

// ════════════════════════════════════════════════════════════════
// 6. STUDENT ENGAGEMENT
// ════════════════════════════════════════════════════════════════
export async function engagement(req: Request, res: Response) {
  const parsed = daysQuerySchema.safeParse(req.query);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);
  const days = parsed.data.days ?? 30;

  try {
    const sinceWindow = nDaysAgo(days);
    const since7d = nDaysAgo(7);
    const since30d = nDaysAgo(30);

    const [
      activeLearners,
      completedEnrollments,
      totalEnrollmentsWindow,
      reviewsAggregate,
      certIssuedWindow,
      flaggedReviews,
      recentReviewsRows,
      lowestRatedCourses,
      stuckEnrollments,
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('last_login_at', since7d).is('deleted_at', null),
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('completion_status', 'completed').gte('completed_at', since30d),
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).gte('created_at', since30d),
      supabase.from('reviews').select('rating', { count: 'exact' }).is('deleted_at', null),
      supabase.from('issued_certificates').select('id', { count: 'exact', head: true }).gte('issued_at', since30d).is('revoked_at', null),
      supabase.from('reviews').select('id, rating, comment, user_id, course_id, created_at').eq('is_flagged', true).order('created_at', { ascending: false }).limit(10),
      supabase.from('reviews').select('id, rating, comment, course_id, user_id, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
      safeAwait<any[]>(() => supabase.rpc('fn_lowest_rated_courses'), []),
      supabase.from('enrollments').select('id, user_id, course_id, last_accessed_at').eq('completion_status', 'in_progress').lt('last_accessed_at', nDaysAgo(14)).order('last_accessed_at', { ascending: true }).limit(10),
    ]);

    const reviews = reviewsAggregate.data ?? [];
    const totalReviews = reviewsAggregate.count ?? 0;
    const avgRating = reviews.length > 0 ? reviews.reduce((a: number, r: any) => a + Number(r.rating ?? 0), 0) / reviews.length : 0;
    const ratingDist = [1, 2, 3, 4, 5].map((star) => ({ star, count: reviews.filter((r: any) => Math.floor(Number(r.rating)) === star).length }));

    const completionRate = (totalEnrollmentsWindow.count ?? 0) > 0
      ? ((completedEnrollments.count ?? 0) / (totalEnrollmentsWindow.count ?? 1))
      : 0;

    return ok(res, {
      kpis: {
        active_learners_7d:        activeLearners.count ?? 0,
        completion_rate_30d_pct:   Math.round(completionRate * 10000) / 100,
        platform_avg_rating:       Math.round(avgRating * 100) / 100,
        total_reviews:             totalReviews,
        certificates_issued_30d:   certIssuedWindow.count ?? 0,
        flagged_reviews:           flaggedReviews.data?.length ?? 0,
      },
      trend: { rating_distribution: ratingDist },
      tables: {
        recent_reviews:        recentReviewsRows.data ?? [],
        flagged_reviews:       flaggedReviews.data ?? [],
        lowest_rated_courses:  lowestRatedCourses,
        stuck_enrollments:     stuckEnrollments.data ?? [],
      },
      meta: { window_days: days, generated_at: new Date().toISOString() },
    });
  } catch (e: any) {
    logger.error({ err: e }, '[AdminDashboards] engagement failed');
    return err(res, e?.message ?? 'failed', 500);
  }
}
