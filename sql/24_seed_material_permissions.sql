-- ═══════════════════════════════════════════════════════════════
--  24 – Seed permissions for Subject, Chapter, Topic
--       and their Translation modules.
--  These resources already have requirePermission middleware
--  on their routes, but the permission rows were never inserted.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────── SUBJECT permissions ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'create',      'Create Subject',       'Create subject records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'read',        'View Subjects',        'View subject records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'update',      'Update Subject',       'Update subject records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'delete',      'Delete Subject',       'Permanently delete subject records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'soft_delete', 'Soft Delete Subject',  'Soft delete subject records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'restore',     'Restore Subject',      'Restore soft-deleted subject records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject', 'activate',    'Activate Subject',     'Toggle active status of subject records')
ON CONFLICT (resource, action) DO NOTHING;


-- ─────────────── SUBJECT TRANSLATION permissions ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'create',      'Create Subject Translation',       'Create subject translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'read',        'View Subject Translations',        'View subject translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'update',      'Update Subject Translation',       'Update subject translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'delete',      'Delete Subject Translation',       'Permanently delete subject translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'soft_delete', 'Soft Delete Subject Translation',  'Soft delete subject translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'restore',     'Restore Subject Translation',      'Restore soft-deleted subject translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('subject_translation', 'activate',    'Activate Subject Translation',     'Toggle active status of subject translation records')
ON CONFLICT (resource, action) DO NOTHING;


-- ─────────────── CHAPTER permissions ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'create',      'Create Chapter',       'Create chapter records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'read',        'View Chapters',        'View chapter records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'update',      'Update Chapter',       'Update chapter records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'delete',      'Delete Chapter',       'Permanently delete chapter records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'soft_delete', 'Soft Delete Chapter',  'Soft delete chapter records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'restore',     'Restore Chapter',      'Restore soft-deleted chapter records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter', 'activate',    'Activate Chapter',     'Toggle active status of chapter records')
ON CONFLICT (resource, action) DO NOTHING;


-- ─────────────── CHAPTER TRANSLATION permissions ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'create',      'Create Chapter Translation',       'Create chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'read',        'View Chapter Translations',        'View chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'update',      'Update Chapter Translation',       'Update chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'delete',      'Delete Chapter Translation',       'Permanently delete chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'soft_delete', 'Soft Delete Chapter Translation',  'Soft delete chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'restore',     'Restore Chapter Translation',      'Restore soft-deleted chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('chapter_translation', 'activate',    'Activate Chapter Translation',     'Toggle active status of chapter translation records')
ON CONFLICT (resource, action) DO NOTHING;


-- ─────────────── TOPIC permissions ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'create',      'Create Topic',       'Create topic records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'read',        'View Topics',        'View topic records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'update',      'Update Topic',       'Update topic records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'delete',      'Delete Topic',       'Permanently delete topic records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'soft_delete', 'Soft Delete Topic',  'Soft delete topic records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'restore',     'Restore Topic',      'Restore soft-deleted topic records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic', 'activate',    'Activate Topic',     'Toggle active status of topic records')
ON CONFLICT (resource, action) DO NOTHING;


-- ─────────────── TOPIC TRANSLATION permissions ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'create',      'Create Topic Translation',       'Create topic translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'read',        'View Topic Translations',        'View topic translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'update',      'Update Topic Translation',       'Update topic translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'delete',      'Delete Topic Translation',       'Permanently delete topic translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'soft_delete', 'Soft Delete Topic Translation',  'Soft delete topic translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'restore',     'Restore Topic Translation',      'Restore soft-deleted topic translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('topic_translation', 'activate',    'Activate Topic Translation',     'Toggle active status of topic translation records')
ON CONFLICT (resource, action) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
--  Assign ALL new permissions to the super_admin role
-- ═══════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
  AND p.resource IN (
    'subject', 'subject_translation',
    'chapter', 'chapter_translation',
    'topic',   'topic_translation'
  )
ON CONFLICT DO NOTHING;
