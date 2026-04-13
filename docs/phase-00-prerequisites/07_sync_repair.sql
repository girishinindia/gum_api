-- ============================================================
-- Phase 0: Sync & Repair Functions
-- ============================================================
-- Purpose : Recalculate table_summary counts from actual data.
--           Use after COPY imports, pg_restore, server crash,
--           or anytime counts may be out of sync.
-- Depends : 02_summary_table.sql (table_summary)
-- ============================================================

-- =============================================
-- FUNCTION: udf_sync_table_summary (single table)
-- =============================================
-- Counts actual rows from source table and UPSERTs into
-- table_summary. Safe to run anytime.
--
-- Usage: SELECT udf_sync_table_summary('countries');
-- =============================================

CREATE OR REPLACE FUNCTION udf_sync_table_summary(p_table_name TEXT)
RETURNS TEXT
SET search_path = public
AS $$
DECLARE
    v_active   INT;
    v_deactive INT;
    v_deleted  INT;
BEGIN
    -- Count actual rows by bucket (single scan)
    EXECUTE format(
        'SELECT
            COUNT(*) FILTER (WHERE is_active = TRUE  AND is_deleted = FALSE),
            COUNT(*) FILTER (WHERE is_active = FALSE AND is_deleted = FALSE),
            COUNT(*) FILTER (WHERE is_deleted = TRUE)
         FROM %I',
        p_table_name
    ) INTO v_active, v_deactive, v_deleted;

    -- UPSERT into table_summary
    INSERT INTO table_summary (table_name, is_active, is_deactive, is_deleted, updated_at)
    VALUES (p_table_name, v_active, v_deactive, v_deleted, CURRENT_TIMESTAMP)
    ON CONFLICT (table_name)
    DO UPDATE SET
        is_active   = EXCLUDED.is_active,
        is_deactive = EXCLUDED.is_deactive,
        is_deleted  = EXCLUDED.is_deleted,
        updated_at  = CURRENT_TIMESTAMP;

    RETURN format('Synced %s → active=%s, deactive=%s, deleted=%s',
                  p_table_name, v_active, v_deactive, v_deleted);
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- FUNCTION: udf_sync_all_table_summaries (all tables at once)
-- =============================================
-- Loops through every row in table_summary and re-syncs.
-- One command to fix everything.
--
-- Usage: SELECT * FROM udf_sync_all_table_summaries();
-- =============================================

CREATE OR REPLACE FUNCTION udf_sync_all_table_summaries()
RETURNS TABLE (result TEXT)
SET search_path = public
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT ts.table_name
        FROM   table_summary ts
        -- Verify the source table still exists
        JOIN   information_schema.tables t
            ON t.table_schema = 'public'
           AND t.table_name   = ts.table_name::text
        ORDER BY ts.table_name
    LOOP
        result := udf_sync_table_summary(r.table_name::text);
        RETURN NEXT;
    END LOOP;

    -- Clean up orphan rows (table was dropped but summary row remains)
    DELETE FROM table_summary ts
    WHERE NOT EXISTS (
        SELECT 1
        FROM   information_schema.tables t
        WHERE  t.table_schema = 'public'
          AND  t.table_name   = ts.table_name::text
    );

    result := 'Cleanup: removed orphan summary rows for dropped tables';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
