-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_documents_update
-- PURPOSE:  Update an existing document. NULL params leave fields untouched.
--           If the caller changes document_type_id or name, the (name, type)
--           uniqueness is re-checked against the effective combination.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_documents_update(
    p_id                BIGINT,
    p_document_type_id  BIGINT  DEFAULT NULL,
    p_name              TEXT    DEFAULT NULL,
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_effective_name CITEXT;
    v_effective_type BIGINT;
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM documents WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active document found with id %.', p_id;
    END IF;

    -- ── Parent guard if document_type_id is being changed ──
    IF p_document_type_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM document_types
            WHERE id = p_document_type_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'Parent document type % does not exist or is deleted.', p_document_type_id;
        END IF;
    END IF;

    -- ── Duplicate guard on effective (name, document_type_id) ──
    IF p_name IS NOT NULL OR p_document_type_id IS NOT NULL THEN
        SELECT
            COALESCE(NULLIF(btrim(p_name), '')::citext, name),
            COALESCE(p_document_type_id, document_type_id)
        INTO v_effective_name, v_effective_type
        FROM documents
        WHERE id = p_id;

        IF EXISTS (
            SELECT 1 FROM documents
            WHERE name             = v_effective_name
              AND document_type_id = v_effective_type
              AND id <> p_id
              AND is_deleted       = FALSE
        ) THEN
            RAISE EXCEPTION 'A document with name "%" already exists under document type %.', v_effective_name::TEXT, v_effective_type;
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE documents
    SET
        document_type_id = COALESCE(p_document_type_id, document_type_id),
        name             = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        description      = COALESCE(p_description, description),
        is_active        = COALESCE(p_is_active, is_active),
        updated_by       = COALESCE(p_updated_by, updated_by),
        updated_at       = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating document: %s', SQLERRM)
    );
END;
$$;
