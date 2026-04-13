-- ============================================================
-- Phase 0: Drop All User-Defined Objects (Clean Reset)
-- ============================================================
-- Purpose : Completely wipe all user-defined database objects
--           so the schema can be rebuilt from scratch.
-- WARNING : This is DESTRUCTIVE. All data will be lost.
-- Run     : Must be executed by a SUPERUSER or database owner.
--
-- SUPABASE SAFETY:
--   This script protects all Supabase-internal objects:
--   • Schemas : auth, storage, realtime, supabase_functions,
--               supabase_migrations, graphql, graphql_public,
--               pgsodium, pgsodium_masks, vault, net, cron, extensions
--   • Extensions: pgjwt, pgsodium, supabase_vault, pg_graphql,
--                 pg_net, pgcrypto (supabase core), plpgsql
--   • Tables  : Supabase-managed tables in public schema are skipped
--
-- ORDER MATTERS:
--   1. Event Triggers   — they intercept DDL, must go first
--   2. Extensions        — they OWN views/functions/types;
--                          CASCADE removes all extension-owned objects
--   3. Triggers          — attached to tables, drop before tables
--   4. Views             — may depend on tables
--   5. Functions/Procs   — may be used by triggers (already gone)
--   6. Tables            — core data objects
--   7. Types/Enums/Domains
--   8. Sequences         — orphaned ones
--   9. Schemas           — custom schemas
-- ============================================================


-- =============================================
-- 1. Drop Event Triggers (must be first — they block DDL)
--    PROTECTED: Supabase-managed event triggers are skipped.
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT evtname
        FROM   pg_event_trigger
        WHERE  evtname NOT IN (
            'issue_pg_graphql_access',          -- Supabase GraphQL
            'issue_pg_net_access',              -- Supabase pg_net
            'pgrst_ddl_watch',                  -- PostgREST DDL watcher
            'pgrst_drop_watch'                  -- PostgREST drop watcher
        )
          AND  evtname NOT LIKE 'supabase_%'    -- catch any future Supabase triggers
    LOOP
        BEGIN
            EXECUTE format('DROP EVENT TRIGGER IF EXISTS %I CASCADE', r.evtname);
            RAISE NOTICE 'Dropped event trigger: %', r.evtname;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped event trigger (no permission): %', r.evtname;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 2. Drop Extensions (BEFORE views/functions!)
--    Extensions own views, functions, types etc.
--    CASCADE will remove all extension-owned objects.
--    e.g. pg_stat_statements owns pg_stat_statements_info view
--    PROTECTED: Supabase-managed extensions are skipped.
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT extname
        FROM   pg_extension
        WHERE  extname NOT IN (
            'plpgsql',              -- system default
            'pgjwt',                -- Supabase auth (JWT signing)
            'pgsodium',             -- Supabase encryption
            'supabase_vault',       -- Supabase secrets vault
            'pg_graphql',           -- Supabase GraphQL engine
            'pg_net',               -- Supabase HTTP/network calls
            'uuid-ossp'             -- Supabase uses for UUID generation
        )
    LOOP
        BEGIN
            EXECUTE format('DROP EXTENSION IF EXISTS %I CASCADE', r.extname);
            RAISE NOTICE 'Dropped extension: %', r.extname;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped extension (no permission): %', r.extname;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 3. Drop All Triggers (on all user tables)
--    PROTECTED: Supabase-internal triggers are skipped.
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT trigger_name, event_object_schema, event_object_table
        FROM   information_schema.triggers
        WHERE  trigger_schema = 'public'
          AND  trigger_name NOT LIKE 'tr_check_filters'        -- Supabase realtime
          AND  trigger_name NOT LIKE 'supabase_%'              -- Supabase-managed
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I CASCADE',
                           r.trigger_name, r.event_object_schema, r.event_object_table);
            RAISE NOTICE 'Dropped trigger: % on %.%', r.trigger_name, r.event_object_schema, r.event_object_table;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped trigger (no permission): % on %.%', r.trigger_name, r.event_object_schema, r.event_object_table;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 4. Drop All Views (including materialized)
--    Only USER-defined views remain here;
--    extension-owned views already removed in step 2.
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Materialized views first
    FOR r IN
        SELECT schemaname, matviewname
        FROM   pg_matviews
        WHERE  schemaname = 'public'
    LOOP
        EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I.%I CASCADE', r.schemaname, r.matviewname);
        RAISE NOTICE 'Dropped materialized view: %.%', r.schemaname, r.matviewname;
    END LOOP;

    -- Regular views
    FOR r IN
        SELECT table_schema, table_name
        FROM   information_schema.views
        WHERE  table_schema = 'public'
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
        RAISE NOTICE 'Dropped view: %.%', r.table_schema, r.table_name;
    END LOOP;
END;
$$;


-- =============================================
-- 5. Drop All User-Defined Functions & Procedures
--    Only USER-defined routines remain here;
--    extension-owned functions already removed in step 2.
--    PROTECTED: Supabase-managed functions are skipped.
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname  AS schema_name,
               p.proname  AS routine_name,
               p.oid,
               CASE p.prokind
                   WHEN 'f' THEN 'FUNCTION'
                   WHEN 'p' THEN 'PROCEDURE'
                   WHEN 'a' THEN 'AGGREGATE'
                   WHEN 'w' THEN 'FUNCTION'   -- window function
               END AS routine_type
        FROM   pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public'
          AND  p.proname NOT IN (
                   'graphql',                          -- Supabase GraphQL
                   'pgrst_watch',                      -- PostgREST watcher
                   'pgrst_drop_watch',                 -- PostgREST drop watcher
                   'grant_pg_net_access',              -- Supabase pg_net
                   'grant_pg_graphql_access',           -- Supabase GraphQL
                   'grant_pgsodium_keyiduser',         -- Supabase pgsodium
                   'grant_supabase_auth_admin_access'  -- Supabase auth
               )
          -- Skip extension-owned functions (already handled in step 2)
          AND  NOT EXISTS (
                   SELECT 1 FROM pg_depend d
                   WHERE  d.objid = p.oid
                     AND  d.deptype = 'e'
               )
    LOOP
        BEGIN
            EXECUTE format('DROP %s IF EXISTS %I.%s(%s) CASCADE',
                           r.routine_type,
                           r.schema_name,
                           r.routine_name,
                           pg_get_function_identity_arguments(r.oid));
            RAISE NOTICE 'Dropped %: %.%', r.routine_type, r.schema_name, r.routine_name;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped % (no permission): %.%', r.routine_type, r.schema_name, r.routine_name;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 6. Drop All Tables
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM   pg_tables
        WHERE  schemaname = 'public'
    LOOP
        BEGIN
            EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
            RAISE NOTICE 'Dropped table: %', r.tablename;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped table (no permission): %', r.tablename;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 7. Drop All User-Defined Types, Enums & Domains
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Domains first
    FOR r IN
        SELECT domain_name
        FROM   information_schema.domains
        WHERE  domain_schema = 'public'
    LOOP
        BEGIN
            EXECUTE format('DROP DOMAIN IF EXISTS public.%I CASCADE', r.domain_name);
            RAISE NOTICE 'Dropped domain: %', r.domain_name;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped domain (no permission): %', r.domain_name;
        END;
    END LOOP;

    -- Enums and composite types
    FOR r IN
        SELECT t.typname, t.typtype
        FROM   pg_type t
        JOIN   pg_namespace n ON n.oid = t.typnamespace
        WHERE  n.nspname = 'public'
          AND  t.typtype IN ('e', 'c')        -- e = enum, c = composite
          AND  NOT EXISTS (                     -- exclude table row types
                   SELECT 1 FROM pg_class c
                   WHERE  c.relname = t.typname
                     AND  c.relnamespace = n.oid
               )
    LOOP
        BEGIN
            EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
            RAISE NOTICE 'Dropped type: %', r.typname;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped type (no permission): %', r.typname;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 8. Drop All Sequences (orphaned ones)
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT sequencename
        FROM   pg_sequences
        WHERE  schemaname = 'public'
    LOOP
        BEGIN
            EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequencename);
            RAISE NOTICE 'Dropped sequence: %', r.sequencename;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped sequence (no permission): %', r.sequencename;
        END;
    END LOOP;
END;
$$;


-- =============================================
-- 9. Drop All Custom Schemas (except public, system & Supabase)
--    PROTECTED: All Supabase-managed schemas are skipped.
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT nspname
        FROM   pg_namespace
        WHERE  nspname NOT IN (
            'public',
            'pg_catalog',
            'information_schema',
            'pg_toast',
            -- ── Supabase-managed schemas ──
            'auth',                    -- Supabase authentication
            'storage',                 -- Supabase file storage
            'realtime',                -- Supabase realtime subscriptions
            'supabase_functions',      -- Supabase edge functions
            'supabase_migrations',     -- Supabase migration tracking
            'graphql',                 -- Supabase GraphQL engine
            'graphql_public',          -- Supabase GraphQL public API
            'pgsodium',                -- Supabase encryption
            'pgsodium_masks',          -- Supabase column masking
            'vault',                   -- Supabase secrets vault
            'net',                     -- Supabase HTTP calls (pg_net)
            'cron',                    -- pg_cron schema
            'extensions'               -- Supabase extensions schema
        )
          AND  nspname NOT LIKE 'pg_%'
          AND  nspname NOT LIKE 'supabase_%'   -- catch any future Supabase schemas
    LOOP
        BEGIN
            EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.nspname);
            RAISE NOTICE 'Dropped schema: %', r.nspname;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipped schema (no permission): %', r.nspname;
        END;
    END LOOP;
END;
$$;


-- ============================================================
-- DONE: Database is now clean for a fresh rebuild.
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE 'All user-defined objects have been dropped successfully.';
END;
$$;
