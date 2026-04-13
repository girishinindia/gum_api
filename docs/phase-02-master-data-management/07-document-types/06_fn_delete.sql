-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_document_types_delete
-- PURPOSE:  Soft-delete a document_type. Blocks the delete if any active
--           `documents` row still references this type (FK integrity).
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_document_types_delete(
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
        SELECT 1 FROM document_types WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Document type with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Referential guard against active documents ─────────
    SELECT EXISTS (
        SELECT 1 FROM documents
        WHERE document_type_id = p_id
          AND is_deleted = FALSE
    ) INTO v_has_refs;

    IF v_has_refs THEN
        RAISE EXCEPTION 'Cannot delete document type: it is currently referenced by active documents.';
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE document_types
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document type %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting document type: %s', SQLERRM)
    );
END;
$$;
