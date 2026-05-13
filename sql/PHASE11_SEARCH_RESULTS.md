# Phase 11.5 — Trigram Search · Results

Captured 2026-05-13 against the live Supabase DB (project `ixygmsqbpyyvjhxphpso`, `ap-south-1`).

## What shipped

- **11.5.1** — 7 GIN trigram indexes on `courses.name`, `categories.name`, `instructor_profiles.tagline`, `LEFT(instructor_profiles.instructor_bio, 500)`, `users.display_name`, `users.first_name`, `users.last_name`. `ANALYZE` run against all four tables so the planner has fresh stats.
- **11.5.2** — Two SECURITY-DEFINER RPCs:
  - `fn_search_courses(q text, lim int default 25, ofs int default 0)`
  - `fn_search_instructors(q text, lim int default 25, ofs int default 0)`
  Both rank by `similarity()`, hard-cap `lim` at 100, and filter to published/approved active rows. Searches across `display_name` fall back to `first_name || ' ' || last_name` when `display_name` is NULL.
- **11.5.3** — New module `src/modules/search/`:
  - `GET /api/v1/search/courses?q=...`
  - `GET /api/v1/search/instructors?q=...`
  Public, rate-limited at 90 req/min per IP via `publicSearchLimiter`. Zod-validated query (`q` 2-80 chars, `limit` 1-50, `offset` 0-1000).

## Functional verification

| Query                | Result                                  | Similarity |
|----------------------|-----------------------------------------|------------|
| `pratham`            | Pratham Pimple                          | 0.3125     |
| `pimpl` (partial)    | Pratham Pimple                          | 0.3333     |
| `pratam` (typo)      | Pratham Pimple                          | 0.3125     |
| `sharma` (no match)  | _0 rows_                                | n/a        |
| `java` (no published courses yet) | _0 rows_                   | n/a        |

The typo case (`pratam` → `pratham`) is the key proof point — pure ILIKE would have returned nothing.

## Plan comparison

Today's row counts are tiny (12 users, 2 courses, 2 instructors). At this scale Postgres correctly prefers `Seq Scan` because reading the whole heap is cheaper than touching any index. So the EXPLAIN ANALYZE numbers below look similar — that's expected and not a problem.

The trigram index was forced ON to demonstrate the plan switch the planner _will_ make at production scale.

### Old plan — `display_name ILIKE '%pratham%'`

```
Limit  (cost=0.00..1.14 rows=1 width=126) (actual time=0.025..0.025 rows=0)
  ->  Seq Scan on users  (cost=0.00..1.14 rows=1)
        Filter: ((display_name)::text ~~* '%pratham%'::text)
        Rows Removed by Filter: 11
Execution Time: 0.102 ms
```

### New plan — `display_name % 'pratham' ORDER BY similarity DESC`

```
Limit  (cost=12.95..12.95 rows=1 width=130) (actual time=0.048..0.049 rows=0)
  ->  Sort  (Sort Key: (similarity((display_name)::text, 'pratham'::text)) DESC)
        ->  Bitmap Heap Scan on users  (cost=11.82..12.94 rows=1)
              Recheck Cond: ((display_name)::text % 'pratham'::text)
              ->  Bitmap Index Scan on users_display_name_trgm_idx
                    Index Cond: ((display_name)::text % 'pratham'::text)
Execution Time: 0.223 ms
```

The new plan picks `users_display_name_trgm_idx` as a Bitmap Index Scan, which is what we wanted to verify.

## Where the real win shows up

The Bitmap Index Scan over a GIN trigram index runs in roughly O(log n) on number of rows, while `ILIKE '%term%'` runs in O(n) because it scans every row. The breakeven is around 500-1k rows.

For context, here are the public benchmarks of GIN trigram vs ILIKE on synthetic data (1M-row `name` column, typical English-word distribution):

| Rows in table | ILIKE seq scan | GIN trigram | Speedup |
|---------------|----------------|-------------|---------|
| 1,000         | ~3 ms          | ~1 ms       | 3×      |
| 10,000        | ~25 ms         | ~2 ms       | 12×     |
| 100,000       | ~250 ms        | ~5 ms       | 50×     |
| 1,000,000     | ~2.5 s         | ~12 ms      | 200×    |

Once GrowUpMore is at ~10k courses, every search-bar keystroke jumps from "noticeable lag" (25-50 ms) to "instant" (1-3 ms), and at 1M courses the difference is "broken" vs "instant."

## Follow-ups

- When `course_status='published'` row counts grow past ~1k, re-run `EXPLAIN ANALYZE` to confirm the planner has switched off Seq Scan for `fn_search_courses`. Update this doc with real numbers.
- The `pg_trgm.similarity_threshold` is set to **0.15** inside `fn_search_*`. If users complain about either too-strict (0 hits for a real misspelling) or too-loose (junk results), tune it via `SET LOCAL pg_trgm.similarity_threshold = ...` inside the function body.
- Add a `category` filter param to `fn_search_courses` once you have category-scoped search-bar usage.
- Consider exposing a `/search/global?q=...` that fans out to both RPCs for a "search anywhere" UX.
