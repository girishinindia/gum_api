-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_specializations_delete
-- PURPOSE:  Soft-delete a specialization. Dormant guard against a future
--           `instructor_profiles` join table.
--
-- NOTE:     The associated icon_url (if any) is NOT removed from Bunny CDN
--           here — that is a higher-level concern handled by the API service
--           layer if/when the deletion path wants to hard-clean storage.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_specializations_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM specializations WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Specialization with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Dormant referential guard: instructor_specializations ───
    IF to_regclass('public.instructor_specializations') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM instructor_specializations WHERE specialization_id = $1'
            INTO v_count USING p_id;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete specialization %: % instructor(s) still reference it.', p_id, v_count;
        END IF;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE specializations
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Specialization %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting specialization: %s', SQLERRM)
    );
END;
$$;
