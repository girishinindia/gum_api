-- ============================================================
-- 33_coupon_management.sql
-- Creates: coupons, coupon_courses, coupon_bundles, coupon_batches, coupon_webinars
-- Seeds permissions, table_summary entries, and activity-log actions
-- ============================================================

-- ── 1. Coupons table ──
CREATE TABLE IF NOT EXISTS public.coupons (
  id            BIGSERIAL PRIMARY KEY,
  coupon_code   VARCHAR(50) NOT NULL UNIQUE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage'
                CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  applicable_to VARCHAR(20) NOT NULL DEFAULT 'all'
                CHECK (applicable_to IN ('all', 'course', 'bundle', 'batch', 'webinar')),
  max_uses      INT,
  used_count    INT NOT NULL DEFAULT 0,
  min_order_value NUMERIC(10,2),
  valid_from    TIMESTAMPTZ,
  valid_until   TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    BIGINT REFERENCES public.users(id),
  updated_by    BIGINT REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(coupon_code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER set_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_select" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "coupons_insert" ON public.coupons FOR INSERT WITH CHECK (true);
CREATE POLICY "coupons_update" ON public.coupons FOR UPDATE USING (true);
CREATE POLICY "coupons_delete" ON public.coupons FOR DELETE USING (true);

-- ── 2. Coupon-Courses junction ──
CREATE TABLE IF NOT EXISTS public.coupon_courses (
  id         BIGSERIAL PRIMARY KEY,
  coupon_id  BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  course_id  BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES public.users(id),
  updated_by BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(coupon_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_courses_coupon ON public.coupon_courses(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_courses_course ON public.coupon_courses(course_id);

CREATE TRIGGER set_coupon_courses_updated_at
  BEFORE UPDATE ON public.coupon_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupon_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon_courses_select" ON public.coupon_courses FOR SELECT USING (true);
CREATE POLICY "coupon_courses_insert" ON public.coupon_courses FOR INSERT WITH CHECK (true);
CREATE POLICY "coupon_courses_update" ON public.coupon_courses FOR UPDATE USING (true);
CREATE POLICY "coupon_courses_delete" ON public.coupon_courses FOR DELETE USING (true);

-- ── 3. Coupon-Bundles junction ──
CREATE TABLE IF NOT EXISTS public.coupon_bundles (
  id         BIGSERIAL PRIMARY KEY,
  coupon_id  BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  bundle_id  BIGINT NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES public.users(id),
  updated_by BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(coupon_id, bundle_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_bundles_coupon ON public.coupon_bundles(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_bundles_bundle ON public.coupon_bundles(bundle_id);

CREATE TRIGGER set_coupon_bundles_updated_at
  BEFORE UPDATE ON public.coupon_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupon_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon_bundles_select" ON public.coupon_bundles FOR SELECT USING (true);
CREATE POLICY "coupon_bundles_insert" ON public.coupon_bundles FOR INSERT WITH CHECK (true);
CREATE POLICY "coupon_bundles_update" ON public.coupon_bundles FOR UPDATE USING (true);
CREATE POLICY "coupon_bundles_delete" ON public.coupon_bundles FOR DELETE USING (true);

-- ── 4. Coupon-Batches junction ──
CREATE TABLE IF NOT EXISTS public.coupon_batches (
  id         BIGSERIAL PRIMARY KEY,
  coupon_id  BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  batch_id   BIGINT NOT NULL REFERENCES public.course_batches(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES public.users(id),
  updated_by BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(coupon_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_batches_coupon ON public.coupon_batches(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_batches_batch ON public.coupon_batches(batch_id);

CREATE TRIGGER set_coupon_batches_updated_at
  BEFORE UPDATE ON public.coupon_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupon_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon_batches_select" ON public.coupon_batches FOR SELECT USING (true);
CREATE POLICY "coupon_batches_insert" ON public.coupon_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "coupon_batches_update" ON public.coupon_batches FOR UPDATE USING (true);
CREATE POLICY "coupon_batches_delete" ON public.coupon_batches FOR DELETE USING (true);

-- ── 5. Coupon-Webinars junction ──
CREATE TABLE IF NOT EXISTS public.coupon_webinars (
  id         BIGSERIAL PRIMARY KEY,
  coupon_id  BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  webinar_id BIGINT NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES public.users(id),
  updated_by BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(coupon_id, webinar_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_webinars_coupon ON public.coupon_webinars(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_webinars_webinar ON public.coupon_webinars(webinar_id);

CREATE TRIGGER set_coupon_webinars_updated_at
  BEFORE UPDATE ON public.coupon_webinars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupon_webinars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon_webinars_select" ON public.coupon_webinars FOR SELECT USING (true);
CREATE POLICY "coupon_webinars_insert" ON public.coupon_webinars FOR INSERT WITH CHECK (true);
CREATE POLICY "coupon_webinars_update" ON public.coupon_webinars FOR UPDATE USING (true);
CREATE POLICY "coupon_webinars_delete" ON public.coupon_webinars FOR DELETE USING (true);

-- ── 6. Seed permissions ──
INSERT INTO public.permissions (resource, action, description) VALUES
  ('coupon', 'create',      'Create coupons'),
  ('coupon', 'update',      'Update coupons'),
  ('coupon', 'soft_delete', 'Soft-delete coupons'),
  ('coupon', 'restore',     'Restore coupons'),
  ('coupon', 'delete',      'Permanently delete coupons'),
  ('coupon', 'view',        'View coupons'),
  ('coupon_course', 'create',      'Create coupon-course links'),
  ('coupon_course', 'update',      'Update coupon-course links'),
  ('coupon_course', 'soft_delete', 'Soft-delete coupon-course links'),
  ('coupon_course', 'restore',     'Restore coupon-course links'),
  ('coupon_course', 'delete',      'Permanently delete coupon-course links'),
  ('coupon_course', 'view',        'View coupon-course links'),
  ('coupon_bundle', 'create',      'Create coupon-bundle links'),
  ('coupon_bundle', 'update',      'Update coupon-bundle links'),
  ('coupon_bundle', 'soft_delete', 'Soft-delete coupon-bundle links'),
  ('coupon_bundle', 'restore',     'Restore coupon-bundle links'),
  ('coupon_bundle', 'delete',      'Permanently delete coupon-bundle links'),
  ('coupon_bundle', 'view',        'View coupon-bundle links'),
  ('coupon_batch', 'create',      'Create coupon-batch links'),
  ('coupon_batch', 'update',      'Update coupon-batch links'),
  ('coupon_batch', 'soft_delete', 'Soft-delete coupon-batch links'),
  ('coupon_batch', 'restore',     'Restore coupon-batch links'),
  ('coupon_batch', 'delete',      'Permanently delete coupon-batch links'),
  ('coupon_batch', 'view',        'View coupon-batch links'),
  ('coupon_webinar', 'create',      'Create coupon-webinar links'),
  ('coupon_webinar', 'update',      'Update coupon-webinar links'),
  ('coupon_webinar', 'soft_delete', 'Soft-delete coupon-webinar links'),
  ('coupon_webinar', 'restore',     'Restore coupon-webinar links'),
  ('coupon_webinar', 'delete',      'Permanently delete coupon-webinar links'),
  ('coupon_webinar', 'view',        'View coupon-webinar links')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant all coupon permissions to super_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
  AND p.resource IN ('coupon', 'coupon_course', 'coupon_bundle', 'coupon_batch', 'coupon_webinar')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ── 7. Table summary entries ──
INSERT INTO public.table_summary (table_name) VALUES
  ('coupons'),
  ('coupon_courses'),
  ('coupon_bundles'),
  ('coupon_batches'),
  ('coupon_webinars')
ON CONFLICT DO NOTHING;

-- ── 8. Update activity log constraint ──
-- Drop existing constraint and recreate with coupon actions added
ALTER TABLE public.admin_activity_logs
  DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;

-- NOTE: When applying this migration, you must include ALL existing actions
-- from the current constraint plus the 25 new coupon actions below.
-- The full constraint should be rebuilt by querying existing distinct actions
-- and appending these new ones:
--   coupon_created, coupon_updated, coupon_soft_deleted, coupon_restored, coupon_deleted,
--   coupon_course_created, coupon_course_updated, coupon_course_soft_deleted, coupon_course_restored, coupon_course_deleted,
--   coupon_bundle_created, coupon_bundle_updated, coupon_bundle_soft_deleted, coupon_bundle_restored, coupon_bundle_deleted,
--   coupon_batch_created, coupon_batch_updated, coupon_batch_soft_deleted, coupon_batch_restored, coupon_batch_deleted,
--   coupon_webinar_created, coupon_webinar_updated, coupon_webinar_soft_deleted, coupon_webinar_restored, coupon_webinar_deleted
