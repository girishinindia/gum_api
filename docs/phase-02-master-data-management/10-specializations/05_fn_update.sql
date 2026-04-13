-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_specializations_update
-- PURPOSE:  Update an existing specialization. NULL params leave fields
--           untouched. Validates category whitelist and name uniqueness
--           (excluding self).
--
-- NOTE:     icon_url is NOT part of this signature. Icon changes flow through
--           the dedicated upload endpoint which handles WebP conversion,
--           ≤100 KB cap, and Bunny CDN replacement of the previous file.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_specializations_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_category          TEXT    DEFAULT NULL,
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_category TEXT;
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM specializations WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active specialization found with id %.', p_id;
    END IF;

    -- ── Validate category if provided ───────────────────────
    IF p_category IS NOT NULL AND btrim(p_category) <> '' THEN
        v_category := btrim(p_category);
        IF v_category NOT IN (
            'technology', 'data', 'design', 'business',
            'language', 'science', 'mathematics', 'arts',
            'health', 'exam_prep', 'professional', 'other'
        ) THEN
            RAISE EXCEPTION 'Invalid category "%". Allowed: technology, data, design, business, language, science, mathematics, arts, health, exam_prep, professional, other.', v_category;
        END IF;
    END IF;

    -- ── Duplicate guard on name (excluding self) ────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM specializations
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A specialization with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE specializations
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        category    = COALESCE(v_category, category),
        description = COALESCE(p_description, description),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Specialization %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating specialization: %s', SQLERRM)
    );
END;
$$;
