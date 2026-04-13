-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_states_restore
-- PURPOSE:  Restore a soft-deleted state.
-- RETURNS:  JSONB { success, message }
--
-- New UDF — no equivalent existed in the old procedure-based layer. Matches
-- phase 01 `udf_countries_restore` semantics: clears is_deleted, sets
-- is_active back to TRUE, and nulls deleted_at.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_states_restore(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify record exists and is currently deleted ───────
    IF NOT EXISTS (
        SELECT 1 FROM states WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'State with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE states
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('State %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring state: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_states_restore(p_id := 10);
-- ══════════════════════════════════════════════════════════════════════════════
