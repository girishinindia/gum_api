-- ============================================================
-- 04-users / 08_add_audit_fks.sql
-- ============================================================
-- Purpose : Retroactively add foreign-key constraints on
--           created_by / updated_by audit columns for tables
--           that were created BEFORE the users table existed.
--
-- Why here: The load order is:
--            01-countries  → 02-roles → 03-permissions → 04-users
--           Those early tables can't inline REFERENCES users(id)
--           because users doesn't exist yet. We defer those FKs
--           until after the users table is created in step 01 of
--           this folder — i.e. right now.
--
-- Tables affected:
--   countries, roles, permissions
--   (users.created_by / updated_by are self-referencing and
--    were already declared inline in 04-users/01_table.sql)
--
-- Policy:
--   ON DELETE SET NULL — if an auditing user is ever hard-deleted
--   (should never happen under soft-delete policy), preserve the
--   audited row and just clear the reference.
--
-- Idempotent: each ALTER runs inside a DO block that checks
-- pg_constraint first, so re-running this file is safe.
-- ============================================================


DO $$
BEGIN
    -- ── countries.created_by → users(id) ──
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_countries_created_by'
    ) THEN
        ALTER TABLE countries
            ADD CONSTRAINT fk_countries_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- ── countries.updated_by → users(id) ──
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_countries_updated_by'
    ) THEN
        ALTER TABLE countries
            ADD CONSTRAINT fk_countries_updated_by
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- ── roles.created_by → users(id) ──
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_roles_created_by'
    ) THEN
        ALTER TABLE roles
            ADD CONSTRAINT fk_roles_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- ── roles.updated_by → users(id) ──
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_roles_updated_by'
    ) THEN
        ALTER TABLE roles
            ADD CONSTRAINT fk_roles_updated_by
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- ── permissions.created_by → users(id) ──
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_permissions_created_by'
    ) THEN
        ALTER TABLE permissions
            ADD CONSTRAINT fk_permissions_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- ── permissions.updated_by → users(id) ──
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_permissions_updated_by'
    ) THEN
        ALTER TABLE permissions
            ADD CONSTRAINT fk_permissions_updated_by
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;


-- ============================================================
-- Verification query (uncomment to inspect after running):
--
-- SELECT conname, conrelid::regclass AS table_name,
--        pg_get_constraintdef(oid) AS definition
-- FROM   pg_constraint
-- WHERE  conname LIKE 'fk_%_created_by'
--    OR  conname LIKE 'fk_%_updated_by'
-- ORDER  BY conname;
-- ============================================================
