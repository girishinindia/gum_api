-- ═══════════════════════════════════════════════════════════════
--  31 – Add missing SEO columns to batch_translations & webinar_translations
--  These columns exist in category_translations, sub_category_translations,
--  sub_topic_translations, etc. but were missed when creating these tables.
-- ═══════════════════════════════════════════════════════════════

-- ─── batch_translations: Add SEO columns ───
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS robots_directive TEXT DEFAULT 'index,follow';
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS focus_keyword TEXT;

-- ─── webinar_translations: Add SEO columns ───
ALTER TABLE webinar_translations ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE webinar_translations ADD COLUMN IF NOT EXISTS robots_directive TEXT DEFAULT 'index,follow';
ALTER TABLE webinar_translations ADD COLUMN IF NOT EXISTS focus_keyword TEXT;
