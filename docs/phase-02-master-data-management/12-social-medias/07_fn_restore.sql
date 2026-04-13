-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_social_medias_restore
-- PURPOSE:  Restore a soft-deleted social media platform.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_social_medias_restore(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify record exists and is currently deleted ───────
    IF NOT EXISTS (
        SELECT 1 FROM social_medias WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Social media with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE social_medias
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Social media %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring social media: %s', SQLERRM)
    );
END;
$$;
