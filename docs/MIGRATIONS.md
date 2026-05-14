# Database migration workflow

This project uses **plain SQL files in `sql/`** run manually through the
Supabase SQL Editor (or `psql` against the connection string). There is no
declarative migration framework — sequence is enforced by the numeric
filename prefix.

For the existing 50+ files, follow what's already there. **This document
exists to lock down what every _new_ public-schema table migration must
include**, because Supabase is tightening the Data API defaults:

- **2026-05-30** — new Supabase projects ship with no auto-grants for
  tables created in `public`. supabase-js / PostgREST / GraphQL all 404
  any table without explicit grants.
- **2026-10-30** — same behaviour enforced on every existing project,
  including this one. Existing tables keep their grants; the rule applies
  only to tables created _after_ that date.

If you forget the grants, PostgREST returns a `42501` error with the exact
GRANT statement to fix it. Catch is, you only see the error in production
on the first call — so just include the block every time.

---

## Required structure for every new public-schema table

Copy `sql/templates/new-table.sql` as a starting point. Each new
`CREATE TABLE` in `public` must be followed by the four blocks below, in
this order:

1. **CREATE TABLE** — the schema definition itself.
2. **Indexes / constraints** — what you'd write today.
3. **GRANTs** — `anon`, `authenticated`, `service_role` — required from
   2026-10-30 onwards. Add them now, never have to backfill.
4. **RLS + policies** — `enable row level security`, then `create policy`
   for each role you granted access to.

```sql
-- 1. CREATE TABLE
create table public.foo (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- 2. Indexes
create index foo_user_id_idx on public.foo (user_id);

-- 3. Data-API grants (required from 2026-10-30)
grant select                          on public.foo to anon;
grant select, insert, update, delete  on public.foo to authenticated;
grant select, insert, update, delete  on public.foo to service_role;

-- 4. RLS + policies
alter table public.foo enable row level security;

create policy "anon can read public rows"
  on public.foo for select to anon
  using (true);  -- tighten as needed

create policy "users can read their own rows"
  on public.foo for select to authenticated
  using (auth.uid() = user_id);

create policy "users can write their own rows"
  on public.foo for insert, update, delete to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## Decision matrix — which roles get which grants

| Role            | When you grant it                                              | Bypasses RLS? |
| --------------- | -------------------------------------------------------------- | ------------- |
| `anon`          | Table has rows readable by logged-out visitors (cms, courses). | No            |
| `authenticated` | Logged-in users may read or write.                             | No            |
| `service_role`  | Always — `gum_api` uses the service key for all backend calls. | Yes           |

> `service_role` still needs an explicit grant under the new defaults
> even though it bypasses RLS — without the grant, PostgREST itself
> rejects the request before RLS is evaluated.

---

## Sequence-revoke (rare, for fully-private tables)

If a table should never be exposed via the Data API at all — for example,
an internal queue table that only `gum_api` touches through a direct
Postgres pool — you can _omit_ the `anon` and `authenticated` grants:

```sql
grant select, insert, update, delete on public.internal_queue to service_role;
revoke all on public.internal_queue from anon, authenticated;
```

This keeps `gum_api` working but prevents the table from being addressable
via supabase-js even if someone obtains an anon key.

---

## How to apply a migration

```bash
# Production / staging
#   1. Open Supabase Dashboard → SQL Editor for the target project.
#   2. Paste the new file's contents and run.
#   3. On success, commit the file to sql/ with the next sequential prefix.

# Local Postgres (psql)
psql "$SUPABASE_DB_URL" -f sql/NN_my_migration.sql

# Verify grants after running
psql "$SUPABASE_DB_URL" -c "
  select grantee, privilege_type
  from   information_schema.role_table_grants
  where  table_schema = 'public'
    and  table_name   = 'foo'
  order  by grantee, privilege_type;
"
```

You should see rows for `anon`, `authenticated`, and `service_role` — if
any is missing for a table you intend to expose via the Data API, add a
follow-up grant migration.

---

## Backfilling existing tables (optional, pre-2026-10-30)

Existing tables already have their grants, so no action is required. If
you want to audit and standardise anyway, run:

```sql
-- One-shot audit: which public tables have NO anon/authenticated grants?
select t.table_name
from   information_schema.tables t
where  t.table_schema = 'public'
  and  not exists (
    select 1
    from   information_schema.role_table_grants g
    where  g.table_schema = 'public'
      and  g.table_name   = t.table_name
      and  g.grantee in ('anon','authenticated')
  )
order  by t.table_name;
```

Any table on that list is invisible to supabase-js / anon clients today —
which is usually intentional (queue, log, internal tables) but worth a
quick sanity check.

---

## Changelog of this doc

- 2026-05-15 — Initial version. Added Data-API grant requirement ahead of
  Supabase's 2026-05-30 / 2026-10-30 enforcement.
