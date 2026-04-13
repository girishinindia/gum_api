-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_social_medias_update
-- PURPOSE:  Update an existing social media. NULL params leave fields untouched.
--           Validates platform_type whitelist and name/code uniqueness
--           (excluding self).
--
-- NOTE:     icon_url is NOT part of this signature. Icon changes flow through
--           the dedicated upload endpoint which handles WebP conversion,
--           ≤100 KB cap, and Bunny CDN replacement of the previous file.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_social_medias_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_code              TEXT    DEFAULT NULL,
    p_base_url          TEXT    DEFAULT NULL,
    p_placeholder       TEXT    DEFAULT NULL,
    p_platform_type     TEXT    DEFAULT NULL,
    p_display_order     INT     DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_platform_type TEXT;
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM social_medias WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active social media found with id %.', p_id;
    END IF;

    -- ── Validate platform_type if provided ──────────────────
    IF p_platform_type IS NOT NULL AND btrim(p_platform_type) <> '' THEN
        v_platform_type := btrim(p_platform_type);
        IF v_platform_type NOT IN (
            'social', 'professional', 'code', 'video',
            'blog', 'portfolio', 'messaging', 'website', 'other'
        ) THEN
            RAISE EXCEPTION 'Invalid platform_type "%". Allowed: social, professional, code, video, blog, portfolio, messaging, website, other.', v_platform_type;
        END IF;
    END IF;

    -- ── Duplicate guard on name (excluding self) ────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM social_medias
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A social media with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Duplicate guard on code (excluding self) ────────────
    IF p_code IS NOT NULL AND btrim(p_code) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM social_medias
            WHERE code = btrim(p_code)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A social media with code "%" already exists.', btrim(p_code);
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE social_medias
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        code        = COALESCE(NULLIF(btrim(p_code), '')::citext, code),
        base_url    = COALESCE(p_base_url, base_url),
        placeholder = COALESCE(p_placeholder, placeholder),
        platform_type = COALESCE(v_platform_type, platform_type),
        display_order = COALESCE(p_display_order, display_order),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Social media %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating social media: %s', SQLERRM)
    );
END;
$$;
