-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_specializations_restore
-- PURPOSE:  Restore a soft-deleted specialization.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_specializations_restore(
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
        SELECT 1 FROM specializations WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Specialization with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE specializations
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Specialization %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring specialization: %s', SQLERRM)
    );
END;
$$;
