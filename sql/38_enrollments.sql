-- ============================================================
-- 38_enrollments.sql
-- Phase 4 of Enrollment & Orders module
-- Creates: enrollments, enrollment_progress, invoices, refunds
-- Seeds permissions, table_summary entries, and activity-log actions
-- ============================================================

-- ── 1. Enrollments table ──
CREATE TABLE IF NOT EXISTS public.enrollments (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id        BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id   BIGINT REFERENCES public.order_items(id) ON DELETE SET NULL,
  item_type       VARCHAR(20) NOT NULL
                  CHECK (item_type IN ('course','bundle','batch','webinar')),
  item_id         BIGINT NOT NULL,
  enrollment_status VARCHAR(30) NOT NULL DEFAULT 'active'
                    CHECK (enrollment_status IN ('active','completed','expired','suspended','cancelled')),
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  progress_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  certificate_url VARCHAR(500),
  certificate_issued_at TIMESTAMPTZ,
  notes           TEXT,
  metadata        JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      BIGINT REFERENCES public.users(id),
  updated_by      BIGINT REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_order ON public.enrollments(order_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_type_id ON public.enrollments(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_enrollments_active ON public.enrollments(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_created ON public.enrollments(created_at);

CREATE TRIGGER set_enrollments_updated_at
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments_select" ON public.enrollments FOR SELECT USING (true);
CREATE POLICY "enrollments_insert" ON public.enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "enrollments_update" ON public.enrollments FOR UPDATE USING (true);
CREATE POLICY "enrollments_delete" ON public.enrollments FOR DELETE USING (true);

-- ── 2. Enrollment Progress table ──
CREATE TABLE IF NOT EXISTS public.enrollment_progress (
  id              BIGSERIAL PRIMARY KEY,
  enrollment_id   BIGINT NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_type    VARCHAR(30) NOT NULL
                  CHECK (content_type IN ('module','subject','chapter','topic','sub_topic','lesson','quiz','assignment','webinar_session')),
  content_id      BIGINT NOT NULL,
  progress_status VARCHAR(20) NOT NULL DEFAULT 'not_started'
                  CHECK (progress_status IN ('not_started','in_progress','completed','skipped')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  time_spent_secs INT NOT NULL DEFAULT 0,
  score           NUMERIC(5,2),
  max_score       NUMERIC(5,2),
  attempts        INT NOT NULL DEFAULT 0,
  last_position   VARCHAR(100),
  metadata        JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      BIGINT REFERENCES public.users(id),
  updated_by      BIGINT REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(enrollment_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_progress_enrollment ON public.enrollment_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_progress_user ON public.enrollment_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_progress_content ON public.enrollment_progress(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_progress_status ON public.enrollment_progress(progress_status);
CREATE INDEX IF NOT EXISTS idx_enrollment_progress_active ON public.enrollment_progress(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER set_enrollment_progress_updated_at
  BEFORE UPDATE ON public.enrollment_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.enrollment_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollment_progress_select" ON public.enrollment_progress FOR SELECT USING (true);
CREATE POLICY "enrollment_progress_insert" ON public.enrollment_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "enrollment_progress_update" ON public.enrollment_progress FOR UPDATE USING (true);
CREATE POLICY "enrollment_progress_delete" ON public.enrollment_progress FOR DELETE USING (true);

-- ── 3. Invoices table ──
CREATE TABLE IF NOT EXISTS public.invoices (
  id                BIGSERIAL PRIMARY KEY,
  invoice_number    VARCHAR(30) NOT NULL UNIQUE,
  order_id          BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id           BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payment_id        BIGINT REFERENCES public.payments(id) ON DELETE SET NULL,
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(10) NOT NULL DEFAULT 'INR',
  invoice_status    VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (invoice_status IN ('draft','issued','paid','cancelled','refunded')),
  issued_at         TIMESTAMPTZ,
  due_at            TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  billing_name      VARCHAR(255),
  billing_email     VARCHAR(255),
  billing_phone     VARCHAR(20),
  billing_address   TEXT,
  billing_city      VARCHAR(100),
  billing_state     VARCHAR(100),
  billing_country   VARCHAR(100),
  billing_pincode   VARCHAR(20),
  gst_number        VARCHAR(20),
  pdf_url           VARCHAR(500),
  notes             TEXT,
  metadata          JSONB,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        BIGINT REFERENCES public.users(id),
  updated_by        BIGINT REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_invoices_active ON public.invoices(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_created ON public.invoices(created_at);

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT USING (true);
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE USING (true);
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE USING (true);

-- Auto-generate invoice number: INV-YYYY-NNNNNN
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 10) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM public.invoices
  WHERE invoice_number LIKE 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-%';

  NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION public.generate_invoice_number();

-- ── 4. Refunds table ──
CREATE TABLE IF NOT EXISTS public.refunds (
  id                    BIGSERIAL PRIMARY KEY,
  refund_number         VARCHAR(30) NOT NULL UNIQUE,
  order_id              BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id            BIGINT NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  user_id               BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  razorpay_refund_id    VARCHAR(100) UNIQUE,
  amount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency              VARCHAR(10) NOT NULL DEFAULT 'INR',
  refund_status         VARCHAR(20) NOT NULL DEFAULT 'requested'
                        CHECK (refund_status IN ('requested','approved','processing','completed','rejected','failed')),
  refund_type           VARCHAR(20) NOT NULL DEFAULT 'full'
                        CHECK (refund_type IN ('full','partial')),
  reason                TEXT,
  admin_notes           TEXT,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at           TIMESTAMPTZ,
  approved_by           BIGINT REFERENCES public.users(id),
  processed_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ,
  rejected_by           BIGINT REFERENCES public.users(id),
  rejection_reason      TEXT,
  notes                 TEXT,
  metadata              JSONB,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            BIGINT REFERENCES public.users(id),
  updated_by            BIGINT REFERENCES public.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON public.refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user ON public.refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_refunds_number ON public.refunds(refund_number);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(refund_status);
CREATE INDEX IF NOT EXISTS idx_refunds_razorpay ON public.refunds(razorpay_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_active ON public.refunds(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_created ON public.refunds(created_at);

CREATE TRIGGER set_refunds_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_select" ON public.refunds FOR SELECT USING (true);
CREATE POLICY "refunds_insert" ON public.refunds FOR INSERT WITH CHECK (true);
CREATE POLICY "refunds_update" ON public.refunds FOR UPDATE USING (true);
CREATE POLICY "refunds_delete" ON public.refunds FOR DELETE USING (true);

-- Auto-generate refund number: RFD-YYYY-NNNNNN
CREATE OR REPLACE FUNCTION public.generate_refund_number()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(refund_number FROM 10) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM public.refunds
  WHERE refund_number LIKE 'RFD-' || TO_CHAR(NOW(), 'YYYY') || '-%';

  NEW.refund_number := 'RFD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_refund_number
  BEFORE INSERT ON public.refunds
  FOR EACH ROW
  WHEN (NEW.refund_number IS NULL OR NEW.refund_number = '')
  EXECUTE FUNCTION public.generate_refund_number();

-- ── 5. Seed permissions ──
INSERT INTO public.permissions (resource, action, display_name, description) VALUES
  ('enrollment', 'create',      'Create Enrollment',          'Create enrollments'),
  ('enrollment', 'update',      'Update Enrollment',          'Update enrollments'),
  ('enrollment', 'soft_delete', 'Soft Delete Enrollment',     'Soft-delete enrollments'),
  ('enrollment', 'restore',     'Restore Enrollment',         'Restore enrollments'),
  ('enrollment', 'delete',      'Delete Enrollment',          'Permanently delete enrollments'),
  ('enrollment', 'read',        'View Enrollments',           'View enrollments'),
  ('enrollment_progress', 'create',      'Create Progress',    'Create enrollment progress'),
  ('enrollment_progress', 'update',      'Update Progress',    'Update enrollment progress'),
  ('enrollment_progress', 'soft_delete', 'Soft Delete Progress','Soft-delete enrollment progress'),
  ('enrollment_progress', 'restore',     'Restore Progress',   'Restore enrollment progress'),
  ('enrollment_progress', 'delete',      'Delete Progress',    'Permanently delete enrollment progress'),
  ('enrollment_progress', 'read',        'View Progress',      'View enrollment progress'),
  ('invoice', 'create',      'Create Invoice',           'Create invoices'),
  ('invoice', 'update',      'Update Invoice',           'Update invoices'),
  ('invoice', 'soft_delete', 'Soft Delete Invoice',      'Soft-delete invoices'),
  ('invoice', 'restore',     'Restore Invoice',          'Restore invoices'),
  ('invoice', 'delete',      'Delete Invoice',           'Permanently delete invoices'),
  ('invoice', 'read',        'View Invoices',            'View invoices'),
  ('refund', 'create',      'Create Refund',            'Create refund requests'),
  ('refund', 'update',      'Update Refund',            'Update refunds'),
  ('refund', 'soft_delete', 'Soft Delete Refund',       'Soft-delete refunds'),
  ('refund', 'restore',     'Restore Refund',           'Restore refunds'),
  ('refund', 'delete',      'Delete Refund',            'Permanently delete refunds'),
  ('refund', 'read',        'View Refunds',             'View refunds'),
  ('refund', 'approve',     'Approve Refund',           'Approve refund requests'),
  ('refund', 'reject',      'Reject Refund',            'Reject refund requests')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant all to super_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
  AND p.resource IN ('enrollment', 'enrollment_progress', 'invoice', 'refund')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ── 6. Table summary entries ──
INSERT INTO public.table_summary (table_name) VALUES
  ('enrollments'),
  ('enrollment_progress'),
  ('invoices'),
  ('refunds')
ON CONFLICT DO NOTHING;

-- ── 7. Update activity log constraint ──
ALTER TABLE public.admin_activity_log
  DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;

-- NOTE: When applying this migration, rebuild the full constraint with ALL
-- existing actions plus these new enrollment/invoice/refund actions:
--   enrollment_created, enrollment_updated, enrollment_soft_deleted, enrollment_restored, enrollment_deleted,
--   enrollment_completed, enrollment_suspended, enrollment_cancelled,
--   enrollment_progress_created, enrollment_progress_updated, enrollment_progress_soft_deleted,
--   enrollment_progress_restored, enrollment_progress_deleted,
--   invoice_created, invoice_updated, invoice_soft_deleted, invoice_restored, invoice_deleted,
--   invoice_issued, invoice_cancelled,
--   refund_created, refund_updated, refund_soft_deleted, refund_restored, refund_deleted,
--   refund_approved, refund_rejected, refund_processed, refund_completed
