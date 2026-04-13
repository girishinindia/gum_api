-- ============================================================
-- Views: document_types
-- ============================================================


CREATE OR REPLACE VIEW uv_document_types
WITH (security_invoker = true) AS
SELECT
    dt.id                   AS document_type_id,
    dt.name                 AS document_type_name,
    dt.description          AS document_type_description,
    dt.created_by           AS document_type_created_by,
    dt.updated_by           AS document_type_updated_by,
    dt.is_active            AS document_type_is_active,
    dt.is_deleted           AS document_type_is_deleted,
    dt.created_at           AS document_type_created_at,
    dt.updated_at           AS document_type_updated_at,
    dt.deleted_at           AS document_type_deleted_at
FROM document_types dt;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All document types via view
-- SELECT * FROM uv_document_types;

-- 2. Single document type by ID
-- SELECT * FROM uv_document_types WHERE document_type_id = 1;

-- 3. Active document types sorted by name
-- SELECT * FROM uv_document_types WHERE document_type_is_active = TRUE AND document_type_is_deleted = FALSE ORDER BY document_type_name;

-- 4. Search by name via view
-- SELECT document_type_name, document_type_description FROM uv_document_types WHERE document_type_name ILIKE '%identity%';

-- 5. Inactive document types
-- SELECT document_type_name, document_type_is_active FROM uv_document_types WHERE document_type_is_active = FALSE;
