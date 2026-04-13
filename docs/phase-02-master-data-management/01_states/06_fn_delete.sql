-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_states_delete
-- PURPOSE:  Soft-delete a state. Guards against deleting a state that still
--           has active (non-deleted) cities under it.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_states_delete` with a UDF matching the API's JSONB contract.
-- Child-city guard uses `to_regclass` so the function stays compilable even
-- if the `cities` table is dropped or absent in a partial schema load.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_states_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_children BOOLEAN := FALSE;
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM states WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'State with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Referential guard: active cities under this state ───
    IF to_regclass('public.cities') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM cities WHERE state_id = $1 AND is_deleted = FALSE)'
            INTO v_has_children
            USING p_id;

        IF v_has_children THEN
            RAISE EXCEPTION 'Cannot delete state: it still has active cities under it.';
        END IF;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE states
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('State %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting state: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_states_delete(p_id := 10);
-- -- Should fail: has active cities
-- SELECT udf_states_delete(p_id := 1);
-- ══════════════════════════════════════════════════════════════════════════════
