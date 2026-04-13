-- ============================================================
-- Phase 0: Seed Summary Row Function
-- ============================================================
-- Purpose : Ensure a row exists in table_summary for a given
--           table name. Idempotent — safe to call repeatedly.
-- Depends : 02_summary_table.sql (table_summary)
-- Used By : 05 (trigger function), 06 (register helper),
--           07 (auto-register event trigger)
-- ============================================================

-- =============================================
-- FUNCTION: udf_seed_summary_row
-- =============================================
-- Ensures a row exists in table_summary for the given table.
-- If row already exists → does nothing (no error).
-- If row does not exist → creates it with counts = 0.
--
-- Usage from SQL:      SELECT udf_seed_summary_row('countries');
-- Usage from PL/pgSQL: PERFORM udf_seed_summary_row('countries');
-- =============================================

CREATE OR REPLACE FUNCTION udf_seed_summary_row(p_table_name TEXT)
RETURNS VOID
SET search_path = public
AS $$
BEGIN
    INSERT INTO table_summary (table_name)
    VALUES (p_table_name)
    ON CONFLICT (table_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
