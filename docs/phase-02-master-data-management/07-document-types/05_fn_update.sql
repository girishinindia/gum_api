-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_document_types_update
-- PURPOSE:  Update an existing document_type. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_document_types_update`. Case-insensitive name uniqueness is
-- enforced (excluding self) before the UPDATE so callers get a clean message.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_document_types_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM document_types WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active document type found with id %.', p_id;
    END IF;

    -- ── Duplicate guard (excluding self) ────────────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM document_types
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A document type with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE document_types
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        description = COALESCE(p_description, description),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document type %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating document type: %s', SQLERRM)
    );
END;
$$;
