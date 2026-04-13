-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_languages_delete
-- PURPOSE:  Soft-delete a language. Dormant referential guard for a future
--           `user_languages` junction table (phase 03).
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_languages_delete` with a UDF matching the API's JSONB
-- contract. `to_regclass` keeps the junction guard dormant until phase 03.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_languages_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_refs BOOLEAN := FALSE;
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM languages WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Language with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Dormant phase-03 referential guard ──────────────────
    IF to_regclass('public.user_languages') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM user_languages WHERE language_id = $1 AND is_deleted = FALSE)'
            INTO v_has_refs
            USING p_id;

        IF v_has_refs THEN
            RAISE EXCEPTION 'Cannot delete language: it is currently referenced by active user_languages rows.';
        END IF;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE languages
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Language %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting language: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_languages_delete(p_id := 44);
-- ══════════════════════════════════════════════════════════════════════════════
