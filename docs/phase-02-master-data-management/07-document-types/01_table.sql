-- ============================================================
-- Table: document_types
-- Purpose: Categories of documents (identity, academic, etc.)
-- ============================================================
-- Used by: documents (specific documents within each type)
-- ============================================================


CREATE TABLE document_types (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Document Type Info ──
    name                CITEXT          NOT NULL UNIQUE,
    description         TEXT,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,

    -- ── Status ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ
);


-- ── Indexes ──

CREATE INDEX idx_document_types_name ON document_types USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_document_types_active ON document_types (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_document_types_content_trgm
    ON document_types
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_document_types_updated_at
    BEFORE UPDATE ON document_types
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO document_types (name, description) VALUES
    ('Identity Proof',          'Government-issued photo ID — Aadhar, PAN, Passport, etc.'),
    ('Residence Proof',         'Proof of current or permanent residence — utility bill, rent agreement, etc.'),
    ('Academic Document',       'Educational certificates, marksheets, transcripts, degrees'),
    ('Professional Document',   'Experience letters, offer letters, relieving letters, pay slips'),
    ('Financial Document',      'Bank account details, cancelled cheque, PAN for KYC/payments'),
    ('Medical Document',        'Medical certificates, fitness certificate, disability certificate'),
    ('Legal Document',          'Affidavits, NOC, court orders, power of attorney'),
    ('Certification',           'Professional certifications — AWS, Google, PMP, Scrum Master, etc.'),
    ('Profile Photo',           'Passport-size photograph for profile and ID card'),
    ('Signature',               'Digital or scanned signature for documents');


-- ── Comments ──
