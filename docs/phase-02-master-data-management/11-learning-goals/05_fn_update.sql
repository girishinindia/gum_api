-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_learning_goals_update
-- PURPOSE:  Update an existing learning goal. NULL params leave fields
--           untouched. Validates name uniqueness (excluding self).
--
-- NOTE:     icon_url is NOT part of this signature. Icon changes flow through
--           the dedicated upload endpoint which handles WebP conversion,
--           ≤100 KB cap, and Bunny CDN replacement of the previous file.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_learning_goals_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_description       TEXT    DEFAULT NULL,
    p_display_order     INT     DEFAULT NULL,
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
        SELECT 1 FROM learning_goals WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active learning goal found with id %.', p_id;
    END IF;

    -- ── Duplicate guard on name (excluding self) ────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM learning_goals
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A learning goal with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE learning_goals
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        description = COALESCE(p_description, description),
        display_order = COALESCE(p_display_order, display_order),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Learning goal %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating learning goal: %s', SQLERRM)
    );
END;
$$;
