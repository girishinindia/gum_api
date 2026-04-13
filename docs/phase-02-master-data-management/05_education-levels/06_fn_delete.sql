-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_education_levels_delete
-- PURPOSE:  Soft-delete an education level. Dormant referential guard for a
--           future `user_education` / `student_profiles` link (phase 03).
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_education_levels_delete` with a UDF matching the API's JSONB
-- contract. `to_regclass` keeps the guard dormant until phase 03.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_education_levels_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_refs BOOLEAN := FALSE;
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM education_levels WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Education level with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Dormant phase-03 referential guard ──────────────────
    IF to_regclass('public.user_education') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM user_education WHERE education_level_id = $1 AND is_deleted = FALSE)'
            INTO v_has_refs
            USING p_id;

        IF v_has_refs THEN
            RAISE EXCEPTION 'Cannot delete education level: it is currently referenced by active user_education rows.';
        END IF;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE education_levels
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Education level %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting education level: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_education_levels_delete(p_id := 60);
-- ══════════════════════════════════════════════════════════════════════════════
