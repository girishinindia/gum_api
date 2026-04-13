-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_document_types_insert
-- PURPOSE:  Insert a new document_type with case-insensitive name uniqueness.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_document_types_insert` with a UDF matching the API's JSONB
-- contract. `document_types.name` is CITEXT UNIQUE, so duplicate checking is
-- case-insensitive by construction; the pre-check exists so callers get a
-- clean message instead of a raw unique-violation error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_document_types_insert(
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
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Document type name cannot be empty.';
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM document_types
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A document type with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO document_types (
        name,
        description,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        p_description,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Document type inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting document type: %s', SQLERRM),
        'id', NULL
    );
END;
$$;
