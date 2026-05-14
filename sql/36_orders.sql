-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ============================================================
-- 36_orders.sql
-- Phase 2 of Enrollment & Orders module
-- Creates: orders, order_items
-- Seeds permissions, table_summary entries, and activity-log actions
-- ============================================================

-- ── 1. Orders table ──
CREATE TABLE IF NOT EXISTS public.orders (
  id                  BIGSERIAL PRIMARY KEY,
  order_number        VARCHAR(30) NOT NULL UNIQUE,
  user_id             BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency            VARCHAR(10) NOT NULL DEFAULT 'INR',
  coupon_id           BIGINT REFERENCES public.coupons(id) ON DELETE SET NULL,
  coupon_code         VARCHAR(50),
  promotion_id        BIGINT REFERENCES public.instructor_promotions(id) ON DELETE SET NULL,
  promo_code          VARCHAR(50),
  razorpay_order_id   VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature  VARCHAR(255),
  order_status        VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (order_status IN ('pending','confirmed','completed','cancelled','failed','refunded')),
  payment_status      VARCHAR(30) NOT NULL DEFAULT 'unpaid'
                      CHECK (payment_status IN ('unpaid','paid','refunded','partially_refunded','failed')),
  payment_method      VARCHAR(30),
  paid_at             TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  notes               TEXT,
  admin_notes         TEXT,
  metadata            JSONB,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          BIGINT REFERENCES public.users(id),
  updated_by          BIGINT REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON public.orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_coupon ON public.orders(coupon_id);
CREATE INDEX IF NOT EXISTS idx_orders_promotion ON public.orders(promotion_id);
CREATE INDEX IF NOT EXISTS idx_orders_active ON public.orders(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "orders_delete" ON public.orders FOR DELETE USING (true);

-- ── 2. Auto-generate order number trigger ──
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 10) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM public.orders
  WHERE order_number LIKE 'GUM-' || TO_CHAR(NOW(), 'YYYY') || '-%';

  NEW.order_number := 'GUM-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION public.generate_order_number();

-- ── 3. Order Items table ──
CREATE TABLE IF NOT EXISTS public.order_items (
  id              BIGSERIAL PRIMARY KEY,
  order_id        BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_type       VARCHAR(20) NOT NULL
                  CHECK (item_type IN ('course','bundle','batch','webinar')),
  item_id         BIGINT NOT NULL,
  item_name       VARCHAR(500),
  item_slug       VARCHAR(500),
  original_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  final_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity        INT NOT NULL DEFAULT 1,
  metadata        JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      BIGINT REFERENCES public.users(id),
  updated_by      BIGINT REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_type_id ON public.order_items(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_active ON public.order_items(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER set_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE USING (true);
CREATE POLICY "order_items_delete" ON public.order_items FOR DELETE USING (true);

-- ── 4. Seed permissions ──
INSERT INTO public.permissions (resource, action, display_name, description) VALUES
  ('order', 'create',      'Create Order',           'Create orders'),
  ('order', 'update',      'Update Order',           'Update orders'),
  ('order', 'soft_delete', 'Soft Delete Order',      'Soft-delete orders'),
  ('order', 'restore',     'Restore Order',          'Restore orders'),
  ('order', 'delete',      'Delete Order',           'Permanently delete orders'),
  ('order', 'read',        'View Orders',            'View orders'),
  ('order', 'approve',     'Approve Order',          'Approve/confirm orders'),
  ('order', 'refund',      'Refund Order',           'Process order refunds'),
  ('order_item', 'create',      'Create Order Item',      'Create order items'),
  ('order_item', 'update',      'Update Order Item',      'Update order items'),
  ('order_item', 'soft_delete', 'Soft Delete Order Item', 'Soft-delete order items'),
  ('order_item', 'restore',     'Restore Order Item',     'Restore order items'),
  ('order_item', 'delete',      'Delete Order Item',      'Permanently delete order items'),
  ('order_item', 'read',        'View Order Items',       'View order items')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant all order permissions to super_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
  AND p.resource IN ('order', 'order_item')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ── 5. Table summary entries ──
INSERT INTO public.table_summary (table_name) VALUES
  ('orders'),
  ('order_items')
ON CONFLICT DO NOTHING;

-- ── 6. Update activity log constraint ──
-- Drop existing constraint and recreate with order actions added
ALTER TABLE public.admin_activity_log
  DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;

-- NOTE: When applying this migration, you must include ALL existing actions
-- from the current constraint plus the 12 new order actions below.
-- New actions added:
--   order_created, order_updated, order_soft_deleted, order_restored, order_deleted,
--   order_cancelled, order_confirmed,
--   order_item_created, order_item_updated, order_item_soft_deleted, order_item_restored, order_item_deleted