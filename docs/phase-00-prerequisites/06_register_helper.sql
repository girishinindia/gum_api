-- ============================================================
-- Phase 0: Register Summary Trigger Helper
-- ============================================================
-- Purpose : One-call helper to attach the summary trigger to
--           any source table AND seed its summary row.
-- Policy  : SOFT DELETE ONLY — trigger fires on INSERT and
--           UPDATE only. No hard DELETE in this system.
-- Depends : 04_seed_summary_function.sql (udf_seed_summary_row)
--           05_trigger_function.sql (fn_manage_table_summary)
-- Used By : 07 (auto-register event trigger calls this)
-- ============================================================

CREATE OR REPLACE FUNCTION udf_register_summary_trigger(p_table_name TEXT)
RETURNS TEXT
SET search_path = public
AS $$
DECLARE
    v_trigger_name TEXT;
    v_has_active   BOOLEAN;
    v_has_deleted  BOOLEAN;
BEGIN
    v_trigger_name := 'trg_summary_' || p_table_name;

    -- ── Safety check: table must have is_active & is_deleted columns ──
    -- Skip tables that don't follow our convention (e.g. table_summary itself)
    SELECT
        EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE  table_schema = 'public'
              AND  table_name   = p_table_name
              AND  column_name  = 'is_active'
        ),
        EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE  table_schema = 'public'
              AND  table_name   = p_table_name
              AND  column_name  = 'is_deleted'
        )
    INTO v_has_active, v_has_deleted;

    IF NOT v_has_active OR NOT v_has_deleted THEN
        RETURN format('SKIPPED %s — missing is_active/is_deleted columns', p_table_name);
    END IF;

    -- ── Step A: Create trigger on the source table ──
    EXECUTE format(
        'CREATE OR REPLACE TRIGGER %I
         AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_manage_table_summary();',
        v_trigger_name,
        p_table_name
    );

    -- ── Step B: Seed summary row (idempotent) ──
    PERFORM udf_seed_summary_row(p_table_name);

    RETURN format('Trigger %s created on %s', v_trigger_name, p_table_name);
END;
$$ LANGUAGE plpgsql;
