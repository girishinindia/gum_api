-- ============================================================
-- Phase 0: Dashboard View
-- ============================================================
-- Purpose : Convenient read-only view for quick dashboard
--           queries on table_summary.
-- Depends : 02_summary_table.sql (table_summary)
-- ============================================================

CREATE OR REPLACE VIEW vw_dashboard_summary
WITH (security_invoker = true) AS
SELECT
    table_name,
    is_active,
    is_deactive,
    is_deleted,
    total,
    updated_at
FROM table_summary
ORDER BY table_name;

-- ============================================================
-- Usage Examples:
--   SELECT * FROM vw_dashboard_summary;
--   SELECT * FROM vw_dashboard_summary WHERE is_deleted > 0;
--   SELECT * FROM vw_dashboard_summary WHERE total > 100;
-- ============================================================
