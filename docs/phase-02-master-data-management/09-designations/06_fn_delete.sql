-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_designations_delete
-- PURPOSE:  Soft-delete a designation. Dormant guard against a future `users`
--           / `employees` table that may reference designation_id.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_designations_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM designations WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Designation with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Dormant referential guard: employees / users ────────
    IF to_regclass('public.employees') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM employees WHERE designation_id = $1 AND is_deleted = FALSE'
            INTO v_count USING p_id;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete designation %: % active employee(s) still reference it.', p_id, v_count;
        END IF;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE designations
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Designation %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting designation: %s', SQLERRM)
    );
END;
$$;
