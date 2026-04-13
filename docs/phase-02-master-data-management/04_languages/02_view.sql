-- ============================================================
-- Views: languages
-- ============================================================


CREATE OR REPLACE VIEW uv_languages
WITH (security_invoker = true) AS
SELECT
    l.id                    AS language_id,
    l.name                  AS language_name,
    l.native_name           AS language_native_name,
    l.iso_code              AS language_iso_code,
    l.script                AS language_script,
    l.created_by            AS language_created_by,
    l.updated_by            AS language_updated_by,
    l.is_active             AS language_is_active,
    l.is_deleted            AS language_is_deleted,
    l.created_at            AS language_created_at,
    l.updated_at            AS language_updated_at,
    l.deleted_at            AS language_deleted_at
FROM languages l;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All languages via view
-- SELECT * FROM uv_languages;

-- 2. Single language by ID
-- SELECT * FROM uv_languages WHERE language_id = 1;

-- 3. Active languages sorted by name
-- SELECT * FROM uv_languages WHERE language_is_active = TRUE AND language_is_deleted = FALSE ORDER BY language_name;

-- 4. Filter by script via view
-- SELECT language_name, language_script FROM uv_languages WHERE language_script = 'Devanagari' AND language_is_deleted = FALSE;

-- 5. Search by name via view
-- SELECT language_name, language_native_name FROM uv_languages WHERE language_name ILIKE '%hindi%';

-- 6. Languages grouped by script
-- SELECT language_script, COUNT(*) AS cnt FROM uv_languages WHERE language_is_deleted = FALSE GROUP BY language_script ORDER BY cnt DESC;

-- 7. Indian languages (Devanagari, Bengali, Telugu, Tamil, etc.)
-- SELECT language_name, language_native_name, language_script FROM uv_languages WHERE language_script NOT IN ('Latin', 'Cyrillic', 'Han', 'Kanji/Kana', 'Hangul', 'Arabic', 'Thai', 'Hebrew', 'Greek', 'Visual') AND language_is_deleted = FALSE ORDER BY language_name;

-- 8. Languages with ISO code
-- SELECT language_name, language_iso_code FROM uv_languages WHERE language_iso_code IS NOT NULL AND language_is_deleted = FALSE ORDER BY language_iso_code;

-- 9. Sign languages
-- SELECT language_name FROM uv_languages WHERE language_script = 'Visual' AND language_is_deleted = FALSE;

-- 10. Inactive languages
-- SELECT language_name, language_is_active FROM uv_languages WHERE language_is_active = FALSE;
