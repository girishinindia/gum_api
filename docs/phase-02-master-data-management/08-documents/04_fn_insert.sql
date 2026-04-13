-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_documents_insert
-- PURPOSE:  Insert a new document under an existing document_type.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_documents_insert` with a UDF matching the API's JSONB contract.
-- Validates the parent document_type exists and is not soft-deleted, and
-- enforces the (name, document_type_id) uniqueness rule with a clean message
-- instead of a raw unique-violation.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_documents_insert(
    p_document_type_id  BIGINT,
    p_name              TEXT,
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_document_type_id IS NULL THEN
        RAISE EXCEPTION 'document_type_id cannot be null.';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Document name cannot be empty.';
    END IF;

    -- ── Parent guard: document_type must exist and be active ─
    IF NOT EXISTS (
        SELECT 1 FROM document_types
        WHERE id = p_document_type_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Parent document type % does not exist or is deleted.', p_document_type_id;
    END IF;

    -- ── Duplicate guard: (name, document_type_id) ───────────
    IF EXISTS (
        SELECT 1 FROM documents
        WHERE name             = btrim(p_name)::citext
          AND document_type_id = p_document_type_id
          AND is_deleted       = FALSE
    ) THEN
        RAISE EXCEPTION 'A document with name "%" already exists under document type %.', btrim(p_name), p_document_type_id;
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO documents (
        document_type_id,
        name,
        description,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        p_document_type_id,
        btrim(p_name)::citext,
        p_description,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting document: %s', SQLERRM),
        'id', NULL
    );
END;
$$;
