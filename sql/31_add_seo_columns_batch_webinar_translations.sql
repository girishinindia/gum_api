-- ═══════════════════════════════════════════════════════════════
--  31 – Add missing columns to batch_translations
--  Tags, Open Graph, Twitter Card, Structured Data, Search Vector
--  (canonical_url, robots_directive, focus_keyword already existed)
-- ═══════════════════════════════════════════════════════════════

-- ── Tags ──
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::JSONB;

-- ── SEO: Open Graph ──
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS og_site_name TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS og_title TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS og_description TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS og_type TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS og_image TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS og_url TEXT;

-- ── SEO: Twitter Card ──
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS twitter_site TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS twitter_title TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS twitter_description TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS twitter_image TEXT;
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS twitter_card TEXT DEFAULT 'summary_large_image';

-- ── Structured Data ──
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '[]'::JSONB;

-- ── Full-Text Search (generated column) ──
ALTER TABLE batch_translations ADD COLUMN IF NOT EXISTS search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(meta_title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(meta_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(focus_keyword, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(tags::TEXT, '')), 'D')
) STORED;

-- ── Index on search_vector ──
CREATE INDEX IF NOT EXISTS idx_batch_translations_search ON batch_translations USING gin(search_vector);
