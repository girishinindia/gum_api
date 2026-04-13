-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_document_types_restore
-- PURPOSE:  Restore a soft-deleted document_type.
-- RETURNS:  JSONB { success, message }
--
-- New UDF — no equivalent existed in the old procedure-based layer.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_document_types_restore(
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
        SELECT 1 FROM document_types WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Document type with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE document_types
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document type %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring document type: %s', SQLERRM)
    );
END;
$$;
