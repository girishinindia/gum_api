-- ============================================================
-- Phase 0: Initial Requirements — PostgreSQL Extensions
-- ============================================================
-- Project : E-Learning Platform
-- Purpose : Enable required PostgreSQL extensions before any
--           schema, table, or function definitions.
-- ============================================================


-- citext: Case-insensitive text data type
-- Used for email addresses, usernames, and other fields where
-- comparisons should be case-insensitive by default.
CREATE EXTENSION IF NOT EXISTS citext;

-- pg_trgm: Trigram-based text similarity and indexing
-- Powers fuzzy search, LIKE/ILIKE optimisation, and similarity
-- scoring across course titles, descriptions, etc.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pgcrypto: Cryptographic functions
-- Supplies hashing (e.g. gen_random_uuid, crypt/gen_salt)
-- for secure password storage and token generation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_stat_statements: Query performance statistics
-- Tracks execution stats of all SQL statements for
-- performance monitoring and query optimisation.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_stat_statements not available locally — will work on Supabase';
END $$;

-- unaccent: Remove accents from text
-- Used by udf_generate_slug() to convert accented characters
-- (é → e, ñ → n, ü → u) for URL-friendly slugs.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- pg_cron: Job scheduler inside PostgreSQL
-- Runs scheduled tasks (like Linux cron) directly in the database.
-- Used for automated weekly sync of table_summary counts.
-- Pre-installed on Supabase — just enable it.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available locally — will work on Supabase';
END $$;
