-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_categories_update
-- PURPOSE:  Update an existing category (parent row only). NULL params leave
--           fields untouched. Validates uniqueness excluding self.
-- NOTE:     icon_url and image_url changes flow through the dedicated upload endpoint.
--           Translations are updated via separate udf_category_translations_update.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_categories_update(
    p_id                BIGINT,
    p_code              CITEXT      DEFAULT NULL,
    p_slug              CITEXT      DEFAULT NULL,
    p_display_order     SMALLINT    DEFAULT NULL,
    p_is_new            BOOLEAN     DEFAULT NULL,
    p_new_until         DATE        DEFAULT NULL,
    p_is_active         BOOLEAN     DEFAULT NULL,
    p_updated_by        BIGINT      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM categories WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active category found with id %.', p_id;
    END IF;

    -- ── Duplicate guard on code (excluding self) ────────────
    IF p_code IS NOT NULL AND btrim(p_code) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM categories
            WHERE code = btrim(p_code)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A category with code "%" already exists.', btrim(p_code);
        END IF;
    END IF;

    -- ── Duplicate guard on slug (excluding self) ────────────
    IF p_slug IS NOT NULL AND btrim(p_slug) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM categories
            WHERE slug = btrim(p_slug)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A category with slug "%" already exists.', btrim(p_slug);
        END IF;
    END IF;

    -- ── Validate new_until if provided ──────────────────────
    IF p_is_new = TRUE AND p_new_until IS NOT NULL AND p_new_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'new_until date must be in the future when is_new is TRUE.';
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE categories
    SET
        code            = COALESCE(NULLIF(btrim(p_code), '')::citext, code),
        slug            = COALESCE(NULLIF(btrim(p_slug), '')::citext, slug),
        display_order   = COALESCE(p_display_order, display_order),
        is_new          = COALESCE(p_is_new, is_new),
        new_until       = CASE
                            WHEN p_is_new = FALSE THEN NULL
                            WHEN p_new_until IS NOT NULL THEN p_new_until
                            ELSE new_until
                          END,
        is_active       = COALESCE(p_is_active, is_active),
        updated_by      = COALESCE(p_updated_by, updated_by),
        updated_at      = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Category %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating category: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Update display order
-- SELECT * FROM udf_categories_update(p_id := 1, p_display_order := 99);

-- Test: Update code
-- SELECT * FROM udf_categories_update(p_id := 1, p_code := 'CAT-NEWCODE');

-- Test: Deactivate category
-- SELECT * FROM udf_categories_update(p_id := 1, p_is_active := FALSE);

-- Test: Should fail — duplicate code
-- SELECT * FROM udf_categories_update(p_id := 1, p_code := 'CAT-DATA');
