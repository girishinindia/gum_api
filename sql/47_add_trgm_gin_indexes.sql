-- ============================================================
-- 47: Full-Text Search — pg_trgm GIN indexes
-- ============================================================
-- Applied via Supabase migration: add_trgm_gin_indexes_for_search
-- pg_trgm extension was already installed.
-- These indexes accelerate ILIKE / similarity() queries
-- on high-traffic text columns across the platform.
-- ============================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_firstname_trgm ON public.users USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_lastname_trgm ON public.users USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON public.users USING gin (email gin_trgm_ops);

-- Courses
CREATE INDEX IF NOT EXISTS idx_courses_name_trgm ON public.courses USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_courses_code_trgm ON public.courses USING gin (code gin_trgm_ops);

-- Blog Posts
CREATE INDEX IF NOT EXISTS idx_blog_posts_title_trgm ON public.blog_posts USING gin (title gin_trgm_ops);

-- Support Tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_subject_trgm ON public.support_tickets USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_support_tickets_number_trgm ON public.support_tickets USING gin (ticket_number gin_trgm_ops);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm ON public.invoices USING gin (invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_name_trgm ON public.invoices USING gin (billing_name gin_trgm_ops);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_number_trgm ON public.transactions USING gin (transaction_number gin_trgm_ops);

-- Chat Messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm ON public.chat_messages USING gin (content gin_trgm_ops);

-- Chat Rooms
CREATE INDEX IF NOT EXISTS idx_chat_rooms_name_trgm ON public.chat_rooms USING gin (name gin_trgm_ops);

-- Coupons
CREATE INDEX IF NOT EXISTS idx_coupons_code_trgm ON public.coupons USING gin (coupon_code gin_trgm_ops);

-- Bundles
CREATE INDEX IF NOT EXISTS idx_bundles_name_trgm ON public.bundles USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bundles_code_trgm ON public.bundles USING gin (code gin_trgm_ops);

-- Chapters
CREATE INDEX IF NOT EXISTS idx_chapters_slug_trgm ON public.chapters USING gin (slug gin_trgm_ops);

-- Topics
CREATE INDEX IF NOT EXISTS idx_topics_slug_trgm ON public.topics USING gin (slug gin_trgm_ops);

-- Sub-topics
CREATE INDEX IF NOT EXISTS idx_sub_topics_slug_trgm ON public.sub_topics USING gin (slug gin_trgm_ops);

-- Enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_notes_trgm ON public.enrollments USING gin (notes gin_trgm_ops);

-- Departments
CREATE INDEX IF NOT EXISTS idx_departments_name_trgm ON public.departments USING gin (name gin_trgm_ops);
