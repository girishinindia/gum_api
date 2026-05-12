import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { ok, err } from '../../utils/response';

const CACHE_TTL = 300; // 5 minutes

/**
 * GET /revenue-dashboard/stats
 * Returns all dashboard stats in a single call.
 * Query: ?period=30 (days, default 30)
 */
export async function getDashboardStats(req: Request, res: Response) {
  try {
    const days = parseInt(req.query.period as string) || 30;
    const cacheKey = `revenue_dashboard:${days}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return ok(res, JSON.parse(cached), 'Dashboard stats (cached)');
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // Run all queries in parallel
    const [
      kpiResult,
      revenueByMonth,
      ordersByStatus,
      enrollmentsByType,
      recentOrders,
      topCourses,
      paymentMethods,
      dailyRevenue,
    ] = await Promise.all([
      // 1. KPI summary
      getKPIs(sinceISO),
      // 2. Revenue by month (last 12 months)
      getRevenueByMonth(),
      // 3. Orders by status
      getOrdersByStatus(sinceISO),
      // 4. Enrollments by item type
      getEnrollmentsByType(sinceISO),
      // 5. Recent orders (last 10)
      getRecentOrders(),
      // 6. Top courses by revenue
      getTopCoursesByRevenue(sinceISO),
      // 7. Payment methods breakdown
      getPaymentMethods(sinceISO),
      // 8. Daily revenue for the period
      getDailyRevenue(sinceISO),
    ]);

    const result = {
      period_days: days,
      kpi: kpiResult,
      revenue_by_month: revenueByMonth,
      orders_by_status: ordersByStatus,
      enrollments_by_type: enrollmentsByType,
      recent_orders: recentOrders,
      top_courses: topCourses,
      payment_methods: paymentMethods,
      daily_revenue: dailyRevenue,
    };

    // Cache result
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);

    return ok(res, result, 'Dashboard stats');
  } catch (e: any) {
    console.error('[DASHBOARD] Error:', e);
    return err(res, e.message || 'Failed to fetch dashboard stats', 500);
  }
}

// ── KPIs ──
async function getKPIs(sinceISO: string) {
  // Total revenue (completed orders in period)
  const { data: revenueData } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('payment_status', 'paid')
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  const totalRevenue = (revenueData || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

  // Total orders in period
  const { count: totalOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  // Total enrollments in period
  const { count: totalEnrollments } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  // Total refunds in period
  const { data: refundData } = await supabase
    .from('refunds')
    .select('amount')
    .in('refund_status', ['completed', 'processing'])
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  const totalRefunds = (refundData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  const refundCount = (refundData || []).length;

  // Average order value
  const avgOrderValue = (totalOrders || 0) > 0 ? Math.round((totalRevenue / (totalOrders || 1)) * 100) / 100 : 0;

  // Conversion rate (paid / total)
  const { count: paidOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('payment_status', 'paid')
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  const conversionRate = (totalOrders || 0) > 0
    ? Math.round(((paidOrders || 0) / (totalOrders || 1)) * 10000) / 100
    : 0;

  // All-time totals
  const { data: allTimeRevenue } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('payment_status', 'paid')
    .is('deleted_at', null);

  const allTimeTotal = (allTimeRevenue || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

  const { count: allTimeEnrollments } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  return {
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_orders: totalOrders || 0,
    total_enrollments: totalEnrollments || 0,
    total_refunds: Math.round(totalRefunds * 100) / 100,
    refund_count: refundCount,
    avg_order_value: avgOrderValue,
    conversion_rate: conversionRate,
    all_time_revenue: Math.round(allTimeTotal * 100) / 100,
    all_time_enrollments: allTimeEnrollments || 0,
  };
}

// ── Revenue by Month (last 12 months) ──
async function getRevenueByMonth() {
  const months: { month: string; revenue: number; orders: number }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', start)
      .lte('created_at', end)
      .is('deleted_at', null);

    const revenue = (data || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    months.push({ month: label, revenue: Math.round(revenue * 100) / 100, orders: (data || []).length });
  }

  return months;
}

// ── Orders by Status ──
async function getOrdersByStatus(sinceISO: string) {
  const statuses = ['pending', 'completed', 'failed', 'cancelled', 'refunded'];
  const result: { status: string; count: number }[] = [];

  for (const status of statuses) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('order_status', status)
      .gte('created_at', sinceISO)
      .is('deleted_at', null);

    result.push({ status, count: count || 0 });
  }

  return result;
}

// ── Enrollments by Item Type ──
async function getEnrollmentsByType(sinceISO: string) {
  const types = ['course', 'bundle', 'batch', 'webinar'];
  const result: { item_type: string; count: number }[] = [];

  for (const t of types) {
    const { count } = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('item_type', t)
      .gte('created_at', sinceISO)
      .is('deleted_at', null);

    result.push({ item_type: t, count: count || 0 });
  }

  return result;
}

// ── Recent Orders ──
async function getRecentOrders() {
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, total_amount, order_status, payment_status, currency, created_at, users!orders_user_id_fkey(id, full_name, email, avatar_url)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  return data || [];
}

// ── Top Courses by Revenue ──
async function getTopCoursesByRevenue(sinceISO: string) {
  const { data: items } = await supabase
    .from('order_items')
    .select('item_type, item_id, item_name, original_price, final_price, quantity, orders!inner(payment_status, created_at, deleted_at)')
    .gte('orders.created_at', sinceISO)
    .eq('orders.payment_status', 'paid')
    .is('orders.deleted_at', null)
    .is('deleted_at', null);

  // Aggregate revenue by item
  const map = new Map<string, { item_type: string; item_id: number; item_name: string; revenue: number; quantity: number }>();

  for (const item of items || []) {
    const key = `${item.item_type}-${item.item_id}`;
    const existing = map.get(key);
    const revenue = (item.final_price || item.original_price || 0) * (item.quantity || 1);

    if (existing) {
      existing.revenue += revenue;
      existing.quantity += item.quantity || 1;
    } else {
      map.set(key, {
        item_type: item.item_type,
        item_id: item.item_id,
        item_name: item.item_name || `${item.item_type} #${item.item_id}`,
        revenue,
        quantity: item.quantity || 1,
      });
    }
  }

  // Sort by revenue, top 10
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(i => ({ ...i, revenue: Math.round(i.revenue * 100) / 100 }));
}

// ── Payment Methods Breakdown ──
async function getPaymentMethods(sinceISO: string) {
  const { data } = await supabase
    .from('payments')
    .select('payment_method, amount')
    .eq('payment_status', 'captured')
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  const map = new Map<string, { method: string; count: number; total: number }>();

  for (const p of data || []) {
    const method = p.payment_method || 'unknown';
    const existing = map.get(method);
    if (existing) {
      existing.count++;
      existing.total += p.amount || 0;
    } else {
      map.set(method, { method, count: 1, total: p.amount || 0 });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .map(m => ({ ...m, total: Math.round(m.total * 100) / 100 }));
}

// ── Daily Revenue ──
async function getDailyRevenue(sinceISO: string) {
  const { data } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .eq('payment_status', 'paid')
    .gte('created_at', sinceISO)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const map = new Map<string, { date: string; revenue: number; orders: number }>();

  for (const o of data || []) {
    const date = o.created_at.substring(0, 10); // YYYY-MM-DD
    const existing = map.get(date);
    if (existing) {
      existing.revenue += o.total_amount || 0;
      existing.orders++;
    } else {
      map.set(date, { date, revenue: o.total_amount || 0, orders: 1 });
    }
  }

  return Array.from(map.values()).map(d => ({
    ...d,
    revenue: Math.round(d.revenue * 100) / 100,
  }));
}
