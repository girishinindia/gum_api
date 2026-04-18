-- ============================================================
-- 12_soft_delete_document_types_documents.sql
-- Soft Delete & Restore for Document Types and Documents
-- Adds deleted_at column, seeds permissions, assigns to roles.
-- table_summary functions already handle deleted_at dynamically.
-- Run AFTER: 11_soft_delete_skills_languages_education_levels.sql
-- Applied as Supabase migration: soft_delete_document_types_documents
-- ============================================================


-- ============================================================
-- 1. ADD deleted_at TO document_types AND documents
-- ============================================================

ALTER TABLE document_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 2. SEED permissions
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('document_type', 'soft_delete', 'Soft Delete Document Type', 'Move a document type to trash',       TRUE),
    ('document_type', 'restore',     'Restore Document Type',     'Restore a document type from trash',   TRUE),
    ('document',      'soft_delete', 'Soft Delete Document',      'Move a document to trash',             TRUE),
    ('document',      'restore',     'Restore Document',          'Restore a document from trash',        TRUE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. ASSIGN to super_admin and admin roles
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('document_type', 'document')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. SYNC table_summary
-- ============================================================

SELECT udf_sync_table_summary('document_types');
SELECT udf_sync_table_summary('documents');
