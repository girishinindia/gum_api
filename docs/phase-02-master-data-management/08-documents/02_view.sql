-- ============================================================
-- View: uv_documents
-- Purpose: All documents with full document type info via uv_document_types
-- ============================================================


CREATE OR REPLACE VIEW uv_documents
WITH (security_invoker = true) AS
SELECT
    -- Document columns
    d.id                    AS document_id,
    d.document_type_id      AS document_document_type_id,
    -- NOTE: both name columns are CITEXT on the base tables. The
    -- udf_get_documents RETURNS TABLE declares them as TEXT, and a
    -- mismatch between view column types and RETURNS TABLE column
    -- types raises `42804 structure of query does not match function
    -- result type` at RETURN QUERY EXECUTE time — so we cast here.
    d.name::TEXT            AS document_name,
    d.description           AS document_description,
    d.created_by            AS document_created_by,
    d.updated_by            AS document_updated_by,
    d.is_active             AS document_is_active,
    d.is_deleted            AS document_is_deleted,
    d.created_at            AS document_created_at,
    d.updated_at            AS document_updated_at,
    d.deleted_at            AS document_deleted_at,

    -- Document Type columns (from document_types table)
    dt.id                           AS document_type_id,
    dt.name::TEXT                   AS document_type_name,
    dt.description                  AS document_type_description,
    dt.is_active                    AS document_type_is_active,
    dt.is_deleted                   AS document_type_is_deleted,
    dt.created_at                   AS document_type_created_at,
    dt.updated_at                   AS document_type_updated_at,
    dt.deleted_at                   AS document_type_deleted_at
FROM documents d
INNER JOIN document_types dt
    ON d.document_type_id = dt.id;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All documents via view
-- SELECT * FROM uv_documents;

-- 2. Single document by ID
-- SELECT * FROM uv_documents WHERE document_id = 1;

-- 3. Documents for a specific type (Identity Proof, type_id = 1)
-- SELECT document_name, document_type_name FROM uv_documents WHERE document_type_id = 1 AND document_is_deleted = FALSE ORDER BY document_name;

-- 4. Active documents with active types
-- SELECT document_name, document_type_name FROM uv_documents WHERE document_is_active = TRUE AND document_type_is_active = TRUE ORDER BY document_type_name, document_name;

-- 5. Search by name via view
-- SELECT document_name, document_type_name FROM uv_documents WHERE document_name ILIKE '%aadhar%';

-- 6. Count documents per type via view
-- SELECT document_type_name, COUNT(*) AS doc_count FROM uv_documents WHERE document_is_deleted = FALSE GROUP BY document_type_name ORDER BY doc_count DESC;

-- 7. Academic documents only
-- SELECT document_name, document_description FROM uv_documents WHERE document_type_name = 'Academic Document' AND document_is_deleted = FALSE ORDER BY document_name;

-- 8. Professional documents only
-- SELECT document_name, document_description FROM uv_documents WHERE document_type_name = 'Professional Document' AND document_is_deleted = FALSE ORDER BY document_name;

-- 9. Certification documents
-- SELECT document_name, document_description FROM uv_documents WHERE document_type_name = 'Certification' AND document_is_deleted = FALSE ORDER BY document_name;

-- 10. Inactive documents
-- SELECT document_name, document_is_active, document_type_name FROM uv_documents WHERE document_is_active = FALSE;
