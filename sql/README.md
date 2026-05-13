# `/sql` — GrowUpMore Database Migrations

> **Source of truth:** the Supabase project's migration history
> (`supabase_migrations.schema_migrations`), accessed via the Supabase MCP
> `apply_migration` / `list_migrations` tools.
>
> **This folder:** human-readable mirror, kept in sync going forward.

---

## The rule

Every change to the live database **must** be applied via Supabase MCP
`apply_migration` AND committed to this folder as a `.sql` file with the
same body. No exceptions.

```text
            ┌──────────────────────────┐
write a     │  MCP apply_migration     │  → live database
migration → │   name="phaseN_<desc>"   │
            │   query=<SQL>            │
            └──────────────────────────┘
                       ↓ mirror the same SQL
            ┌──────────────────────────┐
            │  /sql/<NN>_<desc>.sql    │
            └──────────────────────────┘
```

This gives us:
- **The DB is the source of truth.** Every applied migration is in
  `supabase_migrations.schema_migrations` with timestamp + name. Use
  `list_migrations` to see the history.
- **Local devs can review changes in git diffs.** The mirrored `.sql`
  files surface every DDL change in normal code review.
- **Replay is possible.** A future engineer can rebuild a local Postgres
  by running the live `pg_dump --schema-only` baseline + appending the
  numbered files committed after the baseline.

## File naming

- New files use the prefix that matches the implementation phase:
  ```
  phase0_<short_description>.sql
  phase1_<short_description>.sql
  phase2_<short_description>.sql
  ...
  ```
- Names match the Supabase migration `name` exactly (1-to-1 mirror).
- Order on disk is naturally chronological because phases are sequential.

Legacy files (the `01_*` … `47_*` series) follow an older numeric
convention; they are kept for historical reference but should not be
re-applied to a live database — they would conflict with already-existing
objects.

## How to add a new migration

1. Draft the SQL.
2. Apply via MCP:
   ```
   apply_migration(project_id, name="phaseN_descriptive_name", query=...)
   ```
3. **Save the exact same SQL** as `phaseN_descriptive_name.sql` in this folder.
4. Commit both the new file and any code/service changes in the same PR.

## Files in this folder

### Snapshot + workflow docs
- `SNAPSHOT.md` — live state as of 2026-05-13 (counts, table list,
  function list, security posture).
- `README.md` — this file.

### Active mirror (phase-prefixed; mirror live MCP migrations)

| Phase | Files |
|---|---|
| Phase 2 (Money safety) | `48_webhook_events.sql`, `49_wallet_atomic_udfs.sql`, `50_post_payment_steps.sql` |

> *Note on numbering:* the Phase 2 files use the legacy `NN_` prefix to
> continue the older sequence so they sort correctly next to `47_*`. From
> Phase 3 onward, the convention shifts to `phaseN_<desc>.sql` to clearly
> match the implementation-phase identifier used in the Supabase
> migration names.

### Legacy (historical, do not re-apply as-is)

`01_rbac.sql` … `47_add_trgm_gin_indexes.sql` — the original 48-file
migration set that bootstrapped the project. They describe the pre-Phase-0
state. Replaying them against a live database now would error because
many of their objects (tables, policies, functions) have been further
modified by post-`47` MCP migrations.

If you need a clean rebuild of the schema, ask the Supabase dashboard for
a `pg_dump --schema-only` first instead of replaying these files.

## Linting + advisor checklist before merging a new migration

Before merging any DDL change, run via MCP:

- `get_advisors(type="security")` — should not introduce new ERROR/WARN.
- `get_advisors(type="performance")` — should not introduce new
  `unindexed_foreign_keys`, `multiple_permissive_policies`, or
  `auth_rls_initplan` warnings.

If you must introduce a new warning (e.g. an `unused_index` that will be
used by an upcoming feature), document why in the migration's SQL comment
header.

## Recovery / replay strategy

If the schema ever drifts again:

1. Dump the live schema:
   ```
   # via Supabase Dashboard → Database → Backups → Manual → Schema-only
   ```
   Save as `_baseline_YYYY_MM_DD.sql` in this folder.
2. Mark every legacy file as historical.
3. Reset the working convention to "baseline + numbered append-only".
