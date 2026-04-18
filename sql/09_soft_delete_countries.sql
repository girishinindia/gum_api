-- ============================================================
-- 09_soft_delete_countries.sql
-- Soft Delete & Restore for Countries
-- Adds deleted_at column, is_deleted tracking in table_summary,
-- updates trigger/sync functions, expands permission actions,
-- and seeds country:soft_delete + country:restore permissions.
-- Run AFTER: 08_branches_departments.sql
-- Applied as Supabase migration: soft_delete_countries_v2
-- ============================================================


-- ============================================================
-- 1. ADD deleted_at TO countries
-- ============================================================

ALTER TABLE countries
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 2. ADD is_deleted TO table_summary + REGENERATE total
-- ============================================================

-- Add the is_deleted counter column
ALTER TABLE table_summary
    ADD COLUMN IF NOT EXISTS is_deleted INT NOT NULL DEFAULT 0;

-- Recreate total as generated column: total = is_active + is_inactive
-- (excludes soft-deleted rows)
ALTER TABLE table_summary DROP COLUMN IF EXISTS total;
ALTER TABLE table_summary
    ADD COLUMN total INT GENERATED ALWAYS AS (is_active + is_inactive) STORED;


-- ============================================================
-- 3. UPDATE udf_sync_table_summary() — manual sync function
--    Now detects deleted_at column and counts deleted rows
--    separately, excluding them from active/inactive counts.
-- ============================================================

CREATE OR REPLACE FUNCTION udf_sync_table_summary(p_table_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_is_active  BOOLEAN;
    v_has_status     BOOLEAN;
    v_has_deleted_at BOOLEAN;
    v_active   INT := 0;
    v_inactive INT := 0;
    v_deleted  INT := 0;
BEGIN
    SELECT
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_table_name AND column_name='is_active'),
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_table_name AND column_name='status'),
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_table_name AND column_name='deleted_at')
    INTO v_has_is_active, v_has_status, v_has_deleted_at;

    -- Count soft-deleted rows if column exists
    IF v_has_deleted_at THEN
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE deleted_at IS NOT NULL', p_table_name)
        INTO v_deleted;
    END IF;

    -- Count active / inactive (excluding soft-deleted)
    IF v_has_is_active THEN
        IF v_has_deleted_at THEN
            EXECUTE format(
                'SELECT COUNT(*) FILTER (WHERE is_active = TRUE AND deleted_at IS NULL),
                        COUNT(*) FILTER (WHERE is_active = FALSE AND deleted_at IS NULL)
                 FROM %I', p_table_name
            ) INTO v_active, v_inactive;
        ELSE
            EXECUTE format(
                'SELECT COUNT(*) FILTER (WHERE is_active = TRUE),
                        COUNT(*) FILTER (WHERE is_active = FALSE)
                 FROM %I', p_table_name
            ) INTO v_active, v_inactive;
        END IF;
    ELSIF v_has_status THEN
        IF v_has_deleted_at THEN
            EXECUTE format(
                'SELECT COUNT(*) FILTER (WHERE status = ''active'' AND deleted_at IS NULL),
                        COUNT(*) FILTER (WHERE status != ''active'' AND deleted_at IS NULL)
                 FROM %I', p_table_name
            ) INTO v_active, v_inactive;
        ELSE
            EXECUTE format(
                'SELECT COUNT(*) FILTER (WHERE status = ''active''),
                        COUNT(*) FILTER (WHERE status != ''active'')
                 FROM %I', p_table_name
            ) INTO v_active, v_inactive;
        END IF;
    ELSE
        IF v_has_deleted_at THEN
            EXECUTE format('SELECT COUNT(*) FROM %I WHERE deleted_at IS NULL', p_table_name) INTO v_active;
        ELSE
            EXECUTE format('SELECT COUNT(*) FROM %I', p_table_name) INTO v_active;
        END IF;
        v_inactive := 0;
    END IF;

    INSERT INTO public.table_summary (table_name, is_active, is_inactive, is_deleted, updated_at)
    VALUES (p_table_name, v_active, v_inactive, v_deleted, CURRENT_TIMESTAMP)
    ON CONFLICT (table_name)
    DO UPDATE SET
        is_active   = EXCLUDED.is_active,
        is_inactive = EXCLUDED.is_inactive,
        is_deleted  = EXCLUDED.is_deleted,
        updated_at  = CURRENT_TIMESTAMP;

    RETURN format('Synced %s -> active=%s, inactive=%s, deleted=%s, total=%s',
                  p_table_name, v_active, v_inactive, v_deleted, v_active + v_inactive);
END;
$$;


-- ============================================================
-- 4. UPDATE fn_manage_table_summary() — trigger function
--    Automatically fires on INSERT/UPDATE/DELETE on tracked
--    tables. Now aware of deleted_at column.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_manage_table_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table TEXT := TG_TABLE_NAME;
    v_has_deleted_at BOOLEAN;
    v_active INT;
    v_inactive INT;
    v_deleted INT := 0;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=v_table AND column_name='deleted_at'
    ) INTO v_has_deleted_at;

    IF v_has_deleted_at THEN
        EXECUTE format(
            'SELECT
                COUNT(*) FILTER (WHERE is_active = TRUE AND deleted_at IS NULL),
                COUNT(*) FILTER (WHERE is_active = FALSE AND deleted_at IS NULL),
                COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)
             FROM %I', v_table
        ) INTO v_active, v_inactive, v_deleted;
    ELSE
        EXECUTE format(
            'SELECT
                COUNT(*) FILTER (WHERE is_active = TRUE),
                COUNT(*) FILTER (WHERE is_active = FALSE)
             FROM %I', v_table
        ) INTO v_active, v_inactive;
    END IF;

    INSERT INTO public.table_summary (table_name, is_active, is_inactive, is_deleted, updated_at)
    VALUES (v_table, v_active, v_inactive, v_deleted, CURRENT_TIMESTAMP)
    ON CONFLICT (table_name)
    DO UPDATE SET
        is_active   = EXCLUDED.is_active,
        is_inactive = EXCLUDED.is_inactive,
        is_deleted  = EXCLUDED.is_deleted,
        updated_at  = CURRENT_TIMESTAMP;

    RETURN NULL;
END;
$$;


-- ============================================================
-- 5. EXPAND permission action CHECK constraint
--    Add 'soft_delete' and 'restore' to allowed actions.
-- ============================================================

ALTER TABLE permissions DROP CONSTRAINT IF EXISTS chk_permission_action;
ALTER TABLE permissions ADD CONSTRAINT chk_permission_action CHECK (
    action = ANY(ARRAY[
        'create', 'read', 'update', 'delete',
        'publish', 'unpublish',
        'manage_role', 'manage_permission',
        'export', 'import',
        'enroll', 'unenroll',
        'reorder', 'duplicate',
        'refund', 'approve', 'reject',
        'activate', 'deactivate',
        'soft_delete', 'restore'
    ])
);


-- ============================================================
-- 6. SEED country:soft_delete and country:restore permissions
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('country', 'soft_delete', 'Soft Delete Country',  'Move a country to trash (soft delete)', TRUE),
    ('country', 'restore',     'Restore Country',      'Restore a country from trash',          TRUE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 7. SYNC table_summary for countries
-- ============================================================

SELECT udf_sync_table_summary('countries');
