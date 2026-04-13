-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_learning_goals_delete
-- PURPOSE:  Soft-delete a learning goal.
--
-- NOTE:     The associated icon_url (if any) is NOT removed from Bunny CDN
--           here — that is a higher-level concern handled by the API service
--           layer if/when the deletion path wants to hard-clean storage.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_learning_goals_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM learning_goals WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Learning goal with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE learning_goals
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Learning goal %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting learning goal: %s', SQLERRM)
    );
END;
$$;
