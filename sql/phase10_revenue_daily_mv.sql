-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ─────────────────────────────────────────────────────────────────
-- Phase 10.6 — Revenue dashboard materialised view
--
-- Daily revenue aggregates over the orders table for the admin
-- dashboards. Refresh nightly via cron (CONCURRENTLY so reads aren't
-- blocked). The unique index on `day` is required for the CONCURRENTLY
-- form of REFRESH.
--
-- Applied to live DB on 2026-05-13 via Supabase MCP migration
-- `phase10_revenue_daily_mv`. Mirrored here for the repo history.
-- ─────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.v_revenue_daily;

CREATE MATERIALIZED VIEW public.v_revenue_daily AS
SELECT
  (paid_at AT TIME ZONE 'Asia/Kolkata')::date     AS day,
  COUNT(*)                                         AS orders_count,
  COUNT(DISTINCT user_id)                          AS distinct_customers,
  COALESCE(SUM(total_amount),    0)::numeric(14,2) AS gross_revenue,
  COALESCE(SUM(tax_amount),      0)::numeric(14,2) AS tax_collected,
  COALESCE(SUM(discount_amount), 0)::numeric(14,2) AS discount_total,
  COALESCE(SUM(total_amount - tax_amount), 0)::numeric(14,2) AS net_revenue
FROM public.orders
WHERE payment_status = 'paid'
  AND paid_at IS NOT NULL
  AND deleted_at IS NULL
GROUP BY (paid_at AT TIME ZONE 'Asia/Kolkata')::date
WITH NO DATA;

CREATE UNIQUE INDEX v_revenue_daily_day_uidx
  ON public.v_revenue_daily(day);

CREATE INDEX v_revenue_daily_day_desc_idx
  ON public.v_revenue_daily(day DESC);

REVOKE ALL    ON public.v_revenue_daily FROM PUBLIC;
GRANT  SELECT ON public.v_revenue_daily TO   service_role;
GRANT  SELECT ON public.v_revenue_daily TO   authenticated;

CREATE OR REPLACE FUNCTION public.fn_refresh_revenue_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_populated boolean;
BEGIN
  SELECT c.relispopulated
    INTO v_is_populated
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'v_revenue_daily'
     AND c.relkind = 'm';

  IF COALESCE(v_is_populated, false) THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_revenue_daily;
  ELSE
    REFRESH MATERIALIZED VIEW public.v_revenue_daily;
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_refresh_revenue_daily() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_refresh_revenue_daily() TO   service_role;

SELECT public.fn_refresh_revenue_daily();