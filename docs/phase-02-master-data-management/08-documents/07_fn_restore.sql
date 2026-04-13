-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_documents_restore
-- PURPOSE:  Restore a soft-deleted document. Does NOT automatically restore
--           the parent document_type — if the parent is still soft-deleted,
--           restoring a child creates a dangling row, so we block it.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_documents_restore(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type_id BIGINT;
BEGIN
    -- ── Verify record exists and is currently deleted ───────
    IF NOT EXISTS (
        SELECT 1 FROM documents WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Document with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Parent integrity: parent type must be active ───────
    SELECT document_type_id INTO v_type_id FROM documents WHERE id = p_id;

    IF NOT EXISTS (
        SELECT 1 FROM document_types
        WHERE id = v_type_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot restore document: parent document type % is deleted. Restore the parent first.', v_type_id;
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE documents
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring document: %s', SQLERRM)
    );
END;
$$;
