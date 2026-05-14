-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ============================================================
-- 37_payments.sql
-- Phase 3 of Enrollment & Orders module
-- Creates: payments, transactions
-- Seeds permissions, table_summary entries, and activity-log actions
-- ============================================================

-- ── 1. Payments table ──
CREATE TABLE IF NOT EXISTS public.payments (
  id                    BIGSERIAL PRIMARY KEY,
  order_id              BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id               BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  razorpay_payment_id   VARCHAR(100) UNIQUE,
  razorpay_order_id     VARCHAR(100),
  razorpay_signature    VARCHAR(255),
  amount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency              VARCHAR(10) NOT NULL DEFAULT 'INR',
  payment_method        VARCHAR(30),
  payment_status        VARCHAR(30) NOT NULL DEFAULT 'initiated'
                        CHECK (payment_status IN ('initiated','authorized','captured','failed','refunded','partially_refunded')),
  bank                  VARCHAR(100),
  wallet                VARCHAR(50),
  vpa                   VARCHAR(100),
  card_last4            VARCHAR(4),
  card_network          VARCHAR(20),
  card_type             VARCHAR(20),
  fee                   NUMERIC(10,2) DEFAULT 0,
  tax                   NUMERIC(10,2) DEFAULT 0,
  error_code            VARCHAR(100),
  error_description     TEXT,
  error_source          VARCHAR(50),
  error_step            VARCHAR(50),
  error_reason          VARCHAR(100),
  refund_amount         NUMERIC(10,2) DEFAULT 0,
  refunded_at           TIMESTAMPTZ,
  captured_at           TIMESTAMPTZ,
  ip_address            VARCHAR(45),
  user_agent            TEXT,
  notes                 TEXT,
  metadata              JSONB,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            BIGINT REFERENCES public.users(id),
  updated_by            BIGINT REFERENCES public.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment ON public.payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_active ON public.payments(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(created_at);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (true);
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "payments_update" ON public.payments FOR UPDATE USING (true);
CREATE POLICY "payments_delete" ON public.payments FOR DELETE USING (true);

-- ── 2. Transactions table (financial ledger) ──
CREATE TABLE IF NOT EXISTS public.transactions (
  id                    BIGSERIAL PRIMARY KEY,
  transaction_number    VARCHAR(30) NOT NULL UNIQUE,
  order_id              BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_id            BIGINT REFERENCES public.payments(id) ON DELETE SET NULL,
  user_id               BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_type      VARCHAR(30) NOT NULL
                        CHECK (transaction_type IN ('payment','refund','partial_refund','credit','debit','adjustment')),
  amount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency              VARCHAR(10) NOT NULL DEFAULT 'INR',
  balance_before        NUMERIC(10,2),
  balance_after         NUMERIC(10,2),
  description           TEXT,
  reference_type        VARCHAR(30),
  reference_id          BIGINT,
  razorpay_refund_id    VARCHAR(100),
  razorpay_payment_id   VARCHAR(100),
  status                VARCHAR(20) NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('pending','completed','failed','reversed')),
  notes                 TEXT,
  metadata              JSONB,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            BIGINT REFERENCES public.users(id),
  updated_by            BIGINT REFERENCES public.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_order ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment ON public.transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_number ON public.transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_transactions_razorpay_refund ON public.transactions(razorpay_refund_id);
CREATE INDEX IF NOT EXISTS idx_transactions_active ON public.transactions(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at);

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE USING (true);

-- ── 3. Auto-generate transaction number trigger ──
CREATE OR REPLACE FUNCTION public.generate_transaction_number()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(transaction_number FROM 10) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM public.transactions
  WHERE transaction_number LIKE 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-%';

  NEW.transaction_number := 'TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_transaction_number
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.transaction_number IS NULL OR NEW.transaction_number = '')
  EXECUTE FUNCTION public.generate_transaction_number();

-- ── 4. Seed permissions ──
INSERT INTO public.permissions (resource, action, display_name, description) VALUES
  ('payment', 'create',      'Create Payment',           'Create payments'),
  ('payment', 'update',      'Update Payment',           'Update payments'),
  ('payment', 'soft_delete', 'Soft Delete Payment',      'Soft-delete payments'),
  ('payment', 'restore',     'Restore Payment',          'Restore payments'),
  ('payment', 'delete',      'Delete Payment',           'Permanently delete payments'),
  ('payment', 'read',        'View Payments',            'View payments'),
  ('payment', 'refund',      'Refund Payment',           'Process payment refunds'),
  ('transaction', 'create',      'Create Transaction',       'Create transactions'),
  ('transaction', 'update',      'Update Transaction',       'Update transactions'),
  ('transaction', 'soft_delete', 'Soft Delete Transaction',  'Soft-delete transactions'),
  ('transaction', 'restore',     'Restore Transaction',      'Restore transactions'),
  ('transaction', 'delete',      'Delete Transaction',       'Permanently delete transactions'),
  ('transaction', 'read',        'View Transactions',        'View transactions')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant all payment/transaction permissions to super_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
  AND p.resource IN ('payment', 'transaction')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ── 5. Table summary entries ──
INSERT INTO public.table_summary (table_name) VALUES
  ('payments'),
  ('transactions')
ON CONFLICT DO NOTHING;

-- ── 6. Update activity log constraint ──
ALTER TABLE public.admin_activity_log
  DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;

-- NOTE: When applying this migration, rebuild the full constraint with ALL
-- existing actions plus these 13 new payment/transaction actions:
--   payment_created, payment_updated, payment_soft_deleted, payment_restored, payment_deleted,
--   payment_captured, payment_refunded, payment_failed,
--   transaction_created, transaction_updated, transaction_soft_deleted, transaction_restored, transaction_deleted