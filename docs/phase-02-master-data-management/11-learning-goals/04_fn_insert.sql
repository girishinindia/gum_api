-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_learning_goals_insert
-- PURPOSE:  Insert a new learning goal with name uniqueness validation.
--
-- NOTE:     icon_url is intentionally NOT part of this signature. Icons are
--           managed exclusively through the upload endpoint (which handles
--           WebP conversion, ≤100 KB cap, and Bunny CDN replacement of the
--           previous file). Creating a learning goal always starts with
--           icon_url = NULL.
-- RETURNS:  JSONB { success, message, id }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_learning_goals_insert(
    p_name              TEXT,
    p_description       TEXT    DEFAULT NULL,
    p_display_order     INT     DEFAULT 0,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id   BIGINT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning goal name cannot be empty.';
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM learning_goals
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A learning goal with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO learning_goals (
        name,
        description,
        icon_url,
        display_order,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        p_description,
        NULL,                  -- icon_url is only settable via upload endpoint
        COALESCE(p_display_order, 0),
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Learning goal inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting learning goal: %s', SQLERRM),
        'id', NULL
    );
END;
$$;
