-- ============================================================
-- Template: new public-schema table
-- ============================================================
-- Copy this file as `sql/NN_my_thing.sql`, replace `your_table`
-- with the real table name, and fill in the columns / policies.
--
-- All four blocks (TABLE → INDEXES → GRANTS → RLS) are MANDATORY
-- from 2026-10-30 onwards, when Supabase enforces the new Data
-- API defaults on existing projects. Without the GRANT block,
-- supabase-js / PostgREST will return `42501` and the table will
-- be invisible to the API regardless of RLS policies.
--
-- See docs/MIGRATIONS.md for the full rationale and decision
-- matrix on which roles to grant.
-- ============================================================


-- 1. CREATE TABLE ----------------------------------------------
create table public.your_table (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Optional: keep `updated_at` fresh on every row update
-- (uses the project's standard trigger fn — see _baseline_*.sql).
-- create trigger your_table_set_updated_at
--   before update on public.your_table
--   for each row execute function public.set_updated_at();


-- 2. INDEXES ---------------------------------------------------
-- Always index FK columns the app filters by.
create index if not exists your_table_user_id_idx
  on public.your_table (user_id);


-- 3. DATA-API GRANTS  (required from 2026-10-30) ---------------
-- `anon`          → logged-out visitors. Comment out if the
--                   table should never be visible to the public.
-- `authenticated` → logged-in users via the Data API.
-- `service_role`  → gum_api server-side (uses service key).
--                   Required even though service_role bypasses
--                   RLS — without this grant, PostgREST itself
--                   rejects the request before RLS is checked.
grant select                          on public.your_table to anon;
grant select, insert, update, delete  on public.your_table to authenticated;
grant select, insert, update, delete  on public.your_table to service_role;

-- 3b. (rare) Fully private internal table?
--     Then DON'T grant to anon/authenticated. Example:
--
-- revoke all on public.your_table from anon, authenticated;


-- 4. RLS + POLICIES --------------------------------------------
alter table public.your_table enable row level security;

-- Example policies — replace with the real predicates for your
-- table. Add separate policies per action (select / insert /
-- update / delete) so you can tune them independently.

-- Public read (e.g. for marketing pages). Remove if the table
-- is not meant to be readable while logged out.
create policy "anon can read public rows"
  on public.your_table for select
  to anon
  using (true);

-- Authenticated user can read their own rows.
create policy "users can read their own rows"
  on public.your_table for select
  to authenticated
  using (auth.uid() = user_id);

-- Authenticated user can write their own rows.
create policy "users can insert their own rows"
  on public.your_table for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own rows"
  on public.your_table for update
  to authenticated
  using       (auth.uid() = user_id)
  with check  (auth.uid() = user_id);

create policy "users can delete their own rows"
  on public.your_table for delete
  to authenticated
  using (auth.uid() = user_id);

-- service_role bypasses RLS entirely, no policies needed for it.


-- 5. POST-DEPLOY VERIFICATION ----------------------------------
-- Paste into the SQL Editor after running the file:
--
-- select grantee, privilege_type
-- from   information_schema.role_table_grants
-- where  table_schema = 'public'
--   and  table_name   = 'your_table'
-- order  by grantee, privilege_type;
--
-- You should see rows for anon, authenticated, service_role.
-- If any is missing, the Data API will reject the table with
-- error code 42501.
