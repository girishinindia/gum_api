-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_languages_restore
-- PURPOSE:  Restore a soft-deleted language.
-- RETURNS:  JSONB { success, message }
--
-- New UDF — no equivalent existed in the old procedure-based layer.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_languages_restore(
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
        SELECT 1 FROM languages WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Language with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE languages
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Language %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring language: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_languages_restore(p_id := 44);
-- ══════════════════════════════════════════════════════════════════════════════
