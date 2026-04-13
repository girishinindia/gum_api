-- ============================================================
-- Table: documents
-- Purpose: Specific documents within each document type
-- ============================================================
-- FK: document_type_id → document_types
-- Examples: Aadhar Card (type: Identity Proof), Electricity Bill (type: Residence Proof)
-- ============================================================


CREATE TABLE documents (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationship ──
    document_type_id    BIGINT          NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,

    -- ── Document Info ──
    name                CITEXT          NOT NULL,
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
    deleted_at          TIMESTAMPTZ,

    -- ── Unique name per type ──
    CONSTRAINT uq_documents_name_type UNIQUE (name, document_type_id)
);


-- ── Indexes ──

CREATE INDEX idx_documents_type ON documents (document_type_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_documents_name ON documents USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_documents_active ON documents (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_documents_content_trgm
    ON documents
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

-- Identity Proof (type_id = 1)
INSERT INTO documents (document_type_id, name, description) VALUES
    (1, 'Aadhar Card',             'UIDAI 12-digit Aadhar number with photo'),
    (1, 'PAN Card',                'Income Tax PAN — 10-character alphanumeric'),
    (1, 'Passport',                'International travel document'),
    (1, 'Driving License',         'Motor vehicle driving license'),
    (1, 'Voter ID',                'Election Commission voter identity card'),
    (1, 'Ration Card',             'Government ration card'),
    (1, 'Government Employee ID',  'Central/State government employee ID');

-- Residence Proof (type_id = 2)
INSERT INTO documents (document_type_id, name, description) VALUES
    (2, 'Aadhar Card (Residence)',     'UIDAI Aadhar — accepted as residence proof'),
    (2, 'Passport (Residence)',        'Passport — accepted as residence proof'),
    (2, 'Driving License (Residence)', 'Driving license — accepted as residence proof'),
    (2, 'Voter ID (Residence)',        'Voter ID — accepted as residence proof'),
    (2, 'Ration Card (Residence)',     'Ration card — accepted as residence proof'),
    (2, 'Electricity Bill',            'Recent electricity utility bill (last 3 months)'),
    (2, 'Gas Bill',                    'Recent gas utility bill (last 3 months)'),
    (2, 'Telephone Bill',             'Recent landline/postpaid telephone bill (last 3 months)'),
    (2, 'Water Bill',                  'Recent water utility bill (last 3 months)'),
    (2, 'Bank Statement (Residence)',  'Recent bank statement with address (last 3 months)'),
    (2, 'Rent Agreement',             'Current rent/lease agreement'),
    (2, 'Property Tax Receipt',       'Municipal property tax receipt');

-- Academic Document (type_id = 3)
INSERT INTO documents (document_type_id, name, description) VALUES
    (3, '10th Marksheet',          'Secondary school (SSC/ICSE/CBSE) marksheet'),
    (3, '10th Certificate',        'Secondary school passing certificate'),
    (3, '12th Marksheet',          'Higher secondary (HSC/ISC) marksheet'),
    (3, '12th Certificate',        'Higher secondary passing certificate'),
    (3, 'Diploma Certificate',     'Diploma/Polytechnic certificate'),
    (3, 'Degree Certificate',      'Bachelor''s degree certificate'),
    (3, 'Degree Marksheet',        'Semester/year-wise consolidated marksheet'),
    (3, 'PG Certificate',          'Master''s degree certificate'),
    (3, 'PG Marksheet',            'Postgraduate consolidated marksheet'),
    (3, 'PhD Certificate',         'Doctoral degree certificate'),
    (3, 'Migration Certificate',   'Inter-university migration certificate'),
    (3, 'Transfer Certificate',    'School/college transfer certificate (TC)'),
    (3, 'Character Certificate',   'Character/conduct certificate from institution');

-- Professional Document (type_id = 4)
INSERT INTO documents (document_type_id, name, description) VALUES
    (4, 'Experience Letter',       'Work experience letter from employer'),
    (4, 'Offer Letter',            'Job offer/appointment letter'),
    (4, 'Relieving Letter',        'Relieving letter from previous employer'),
    (4, 'Pay Slip',                'Recent salary pay slip'),
    (4, 'Resume / CV',             'Latest resume or curriculum vitae'),
    (4, 'Recommendation Letter',   'Professional recommendation/reference letter');

-- Financial Document (type_id = 5)
INSERT INTO documents (document_type_id, name, description) VALUES
    (5, 'Cancelled Cheque',        'Cancelled cheque leaf for bank verification'),
    (5, 'Bank Passbook',           'Bank passbook first page with details'),
    (5, 'GST Certificate',         'GST registration certificate (if applicable)'),
    (5, 'Income Tax Return',       'Latest ITR acknowledgement');

-- Medical Document (type_id = 6)
INSERT INTO documents (document_type_id, name, description) VALUES
    (6, 'Medical Fitness Certificate',  'Doctor-certified fitness certificate'),
    (6, 'Disability Certificate',       'Government disability certificate (PwD)'),
    (6, 'Vaccination Record',           'Vaccination/immunization record');

-- Legal Document (type_id = 7)
INSERT INTO documents (document_type_id, name, description) VALUES
    (7, 'Affidavit',               'Notarized affidavit (name change, gap year, etc.)'),
    (7, 'NOC',                     'No Objection Certificate'),
    (7, 'Power of Attorney',       'Legal power of attorney document');

-- Certification (type_id = 8)
INSERT INTO documents (document_type_id, name, description) VALUES
    (8, 'AWS Certification',           'Amazon Web Services certified'),
    (8, 'Google Cloud Certification',  'Google Cloud Platform certified'),
    (8, 'Azure Certification',         'Microsoft Azure certified'),
    (8, 'PMP Certification',           'Project Management Professional'),
    (8, 'Scrum Master Certification',  'Certified ScrumMaster (CSM/PSM)'),
    (8, 'Other Certification',         'Any other professional certification');

-- Profile Photo (type_id = 9)
INSERT INTO documents (document_type_id, name, description) VALUES
    (9, 'Passport Size Photo',     'Recent passport-size photograph (white background)');

-- Signature (type_id = 10)
INSERT INTO documents (document_type_id, name, description) VALUES
    (10, 'Digital Signature',      'Scanned or digital signature');


-- ── Comments ──
