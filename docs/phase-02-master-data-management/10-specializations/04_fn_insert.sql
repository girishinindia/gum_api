-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_specializations_insert
-- PURPOSE:  Insert a new specialization with name uniqueness validation and
--           category whitelist enforcement.
--
-- NOTE:     icon_url is intentionally NOT part of this signature. Icons are
--           managed exclusively through the upload endpoint (which handles
--           WebP conversion, ≤100 KB cap, and Bunny CDN replacement of the
--           previous file). Creating a specialization always starts with
--           icon_url = NULL.
-- RETURNS:  JSONB { success, message, id }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_specializations_insert(
    p_name              TEXT,
    p_category          TEXT    DEFAULT 'technology',
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id   BIGINT;
    v_category TEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Specialization name cannot be empty.';
    END IF;

    v_category := COALESCE(btrim(p_category), 'technology');

    -- ── Validate category whitelist ─────────────────────────
    IF v_category NOT IN (
        'technology', 'data', 'design', 'business',
        'language', 'science', 'mathematics', 'arts',
        'health', 'exam_prep', 'professional', 'other'
    ) THEN
        RAISE EXCEPTION 'Invalid category "%". Allowed: technology, data, design, business, language, science, mathematics, arts, health, exam_prep, professional, other.', v_category;
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM specializations
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A specialization with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO specializations (
        name,
        category,
        description,
        icon_url,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        v_category,
        p_description,
        NULL,                  -- icon_url is only settable via upload endpoint
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Specialization inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting specialization: %s', SQLERRM),
        'id', NULL
    );
END;
$$;
