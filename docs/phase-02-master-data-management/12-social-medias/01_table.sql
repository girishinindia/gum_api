-- ============================================================
-- Table: social_medias
-- Purpose: Master list of social media platforms
-- ============================================================
-- Used by: user_social_medias (user's social media links)
-- Examples: LinkedIn, GitHub, Twitter/X, YouTube, Instagram
-- ============================================================


CREATE TABLE social_medias (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Platform Info ──
    name                CITEXT          NOT NULL UNIQUE,            -- 'LinkedIn', 'GitHub'
    code                CITEXT          NOT NULL UNIQUE,            -- 'linkedin', 'github'
    base_url            TEXT,                                       -- 'https://linkedin.com/'
    icon_url            TEXT,                                       -- platform icon for UI
    placeholder         TEXT,                                       -- 'https://linkedin.com/in/your-profile'
    platform_type       TEXT            NOT NULL DEFAULT 'social'
                        CONSTRAINT chk_social_medias_type
                        CHECK (platform_type IN (
                            'social',           -- Facebook, Instagram, Twitter
                            'professional',     -- LinkedIn, AngelList
                            'code',             -- GitHub, GitLab, Bitbucket
                            'video',            -- YouTube, Vimeo, Twitch
                            'blog',             -- Medium, Dev.to, Hashnode
                            'portfolio',        -- Behance, Dribbble
                            'messaging',        -- Telegram, Discord, Slack
                            'website',          -- Personal website / portfolio
                            'other'
                        )),
    display_order       INT             NOT NULL DEFAULT 0,

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

CREATE INDEX idx_social_medias_name ON social_medias USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_social_medias_code ON social_medias (code)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_social_medias_type ON social_medias (platform_type)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_social_medias_order ON social_medias (display_order)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_social_medias_active ON social_medias (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_social_medias_content_trgm
    ON social_medias
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(code::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_social_medias_updated_at
    BEFORE UPDATE ON social_medias
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO social_medias (name, code, base_url, placeholder, platform_type, display_order) VALUES
    -- Professional
    ('LinkedIn',        'linkedin',     'https://linkedin.com/',        'https://linkedin.com/in/your-profile',     'professional', 1),
    ('AngelList',       'angellist',    'https://angel.co/',            'https://angel.co/u/your-profile',          'professional', 2),

    -- Code
    ('GitHub',          'github',       'https://github.com/',          'https://github.com/your-username',         'code',         3),
    ('GitLab',          'gitlab',       'https://gitlab.com/',          'https://gitlab.com/your-username',         'code',         4),
    ('Bitbucket',       'bitbucket',    'https://bitbucket.org/',       'https://bitbucket.org/your-username',      'code',         5),
    ('Stack Overflow',  'stackoverflow','https://stackoverflow.com/',   'https://stackoverflow.com/users/your-id',  'code',         6),
    ('LeetCode',        'leetcode',     'https://leetcode.com/',        'https://leetcode.com/your-username',       'code',         7),
    ('HackerRank',      'hackerrank',   'https://hackerrank.com/',      'https://hackerrank.com/your-username',     'code',         8),
    ('CodePen',         'codepen',      'https://codepen.io/',          'https://codepen.io/your-username',         'code',         9),

    -- Social
    ('Twitter / X',     'twitter',      'https://x.com/',              'https://x.com/your-handle',                'social',       10),
    ('Facebook',        'facebook',     'https://facebook.com/',       'https://facebook.com/your-profile',        'social',       11),
    ('Instagram',       'instagram',    'https://instagram.com/',      'https://instagram.com/your-handle',        'social',       12),
    ('Reddit',          'reddit',       'https://reddit.com/',         'https://reddit.com/user/your-username',    'social',       13),
    ('Threads',         'threads',      'https://threads.net/',        'https://threads.net/@your-handle',         'social',       14),

    -- Video
    ('YouTube',         'youtube',      'https://youtube.com/',        'https://youtube.com/@your-channel',        'video',        15),
    ('Vimeo',           'vimeo',        'https://vimeo.com/',          'https://vimeo.com/your-profile',           'video',        16),
    ('Twitch',          'twitch',       'https://twitch.tv/',          'https://twitch.tv/your-channel',           'video',        17),

    -- Blog
    ('Medium',          'medium',       'https://medium.com/',         'https://medium.com/@your-handle',          'blog',         18),
    ('Dev.to',          'devto',        'https://dev.to/',             'https://dev.to/your-username',             'blog',         19),
    ('Hashnode',        'hashnode',     'https://hashnode.com/',       'https://hashnode.com/@your-handle',        'blog',         20),

    -- Portfolio
    ('Behance',         'behance',      'https://behance.net/',        'https://behance.net/your-profile',         'portfolio',    21),
    ('Dribbble',        'dribbble',     'https://dribbble.com/',       'https://dribbble.com/your-username',       'portfolio',    22),
    ('Kaggle',          'kaggle',       'https://kaggle.com/',         'https://kaggle.com/your-username',         'portfolio',    23),

    -- Messaging
    ('Telegram',        'telegram',     'https://t.me/',               'https://t.me/your-username',               'messaging',    24),
    ('Discord',         'discord',      'https://discord.com/',        'your-username#1234',                       'messaging',    25),
    ('Slack',           'slack',        'https://slack.com/',          'workspace-name',                           'messaging',    26),

    -- Website
    ('Personal Website','website',      NULL,                          'https://your-website.com',                 'website',      27),
    ('Portfolio Website','portfolio',   NULL,                          'https://your-portfolio.com',               'website',      28);


-- ── Comments ──
