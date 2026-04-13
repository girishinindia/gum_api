-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_skills_delete
-- PURPOSE:  Soft-delete a skill. Dormant referential guard for a future
--           `user_skills` junction table (phase 03).
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_skills_delete` with a UDF matching the API's JSONB contract.
-- The phase-03 junction guard uses `to_regclass` so this function compiles
-- and runs cleanly today (when the junction doesn't exist yet) and starts
-- blocking referenced deletes the moment `user_skills` lands.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_skills_delete(
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
        SELECT 1 FROM skills WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Skill with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Dormant phase-03 referential guard ──────────────────
    IF to_regclass('public.user_skills') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM user_skills WHERE skill_id = $1 AND is_deleted = FALSE)'
            INTO v_has_refs
            USING p_id;

        IF v_has_refs THEN
            RAISE EXCEPTION 'Cannot delete skill: it is currently referenced by active user_skills rows.';
        END IF;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE skills
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Skill %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting skill: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_skills_delete(p_id := 10);
-- ══════════════════════════════════════════════════════════════════════════════
