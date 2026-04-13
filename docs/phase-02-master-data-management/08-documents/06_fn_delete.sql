-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_documents_delete
-- PURPOSE:  Soft-delete a document.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_documents_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM documents WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Document with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE documents
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting document: %s', SQLERRM)
    );
END;
$$;
