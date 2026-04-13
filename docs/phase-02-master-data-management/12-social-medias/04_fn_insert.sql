-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_social_medias_insert
-- PURPOSE:  Insert a new social media platform with name and code uniqueness
--           validation and platform_type whitelist enforcement.
--
-- NOTE:     icon_url is intentionally NOT part of this signature. Icons are
--           managed exclusively through the upload endpoint (which handles
--           WebP conversion, ≤100 KB cap, and Bunny CDN replacement of the
--           previous file). Creating a social media always starts with
--           icon_url = NULL.
-- RETURNS:  JSONB { success, message, id }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_social_medias_insert(
    p_name              TEXT,
    p_code              TEXT,
    p_base_url          TEXT    DEFAULT NULL,
    p_placeholder       TEXT    DEFAULT NULL,
    p_platform_type     TEXT    DEFAULT 'social',
    p_display_order     INT     DEFAULT 0,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id        BIGINT;
    v_platform_type TEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Social media name cannot be empty.';
    END IF;

    IF p_code IS NULL OR btrim(p_code) = '' THEN
        RAISE EXCEPTION 'Social media code cannot be empty.';
    END IF;

    v_platform_type := COALESCE(btrim(p_platform_type), 'social');

    -- ── Validate platform_type whitelist ────────────────────
    IF v_platform_type NOT IN (
        'social', 'professional', 'code', 'video',
        'blog', 'portfolio', 'messaging', 'website', 'other'
    ) THEN
        RAISE EXCEPTION 'Invalid platform_type "%". Allowed: social, professional, code, video, blog, portfolio, messaging, website, other.', v_platform_type;
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM social_medias
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A social media with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Duplicate guard: case-insensitive code ──────────────
    IF EXISTS (
        SELECT 1 FROM social_medias
        WHERE code = btrim(p_code)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A social media with code "%" already exists.', btrim(p_code);
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO social_medias (
        name,
        code,
        base_url,
        icon_url,
        placeholder,
        platform_type,
        display_order,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        btrim(p_code)::citext,
        p_base_url,
        NULL,                  -- icon_url is only settable via upload endpoint
        p_placeholder,
        v_platform_type,
        COALESCE(p_display_order, 0),
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Social media inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting social media: %s', SQLERRM),
        'id', NULL
    );
END;
$$;
