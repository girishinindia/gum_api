# Phase 13 — Profile Consolidation

Date applied: **2026-05-13**.
Live Supabase project: `ixygmsqbpyyvjhxphpso` (ap-south-1).

## Summary

| Table | Before | After | What changed |
|---|---|---|---|
| `users` | 22 cols, 11 rows | **22 cols, 11 rows** | untouched (central anchor for 237 FKs) |
| `user_profiles` | 56 cols, 10 rows | **56 cols, 10 rows** | untouched (generic personal info) |
| All `user_*` helper tables | — | — | untouched (education, experience, skills, badges, etc.) |
| `referral_codes` / `referral_usages` / `referral_rewards` | — | — | untouched (dedicated referral subsystem, FKs to `users.id` directly) |
| `employee_profiles` | 52 cols, 1 row | **DROPPED** | HR/payroll fields — no active feature depended on it |
| `student_profiles` | 58 cols, 4 rows | **DROPPED** | denormalised counters + gamification + parent contact + referral attribution; counters re-derive from source tables (enrollments, issued_certificates, user_badges); referral attribution waits for the referral product launch |
| `instructor_profiles` | 62 cols, 2 rows | **30 cols, 2 rows** | trimmed to business state only (approval workflow, GSTIN/PAN, payment model, earnings, ratings) |

## Why this shape

Three tables in the original schema were unused or duplicated logic that already lives elsewhere:

- `employee_profiles` — 1 row of test data, no HR product on the roadmap.
- `student_profiles` — counter columns (`courses_enrolled`, `certificates_earned`, `total_badges_earned`, `xp_points`) were denormalised mirrors of data that already lives in `enrollments`, `issued_certificates`, `user_badges`, `badges.xp_reward`. Compute on demand if needed.
- `instructor_profiles` — 32 cols were never read or written by any code path. Only ~30 are part of the Phase 8 + 9 payout/tax/invoice pipeline.

Putting all of this into one mega `users` table was the original ask, but rejected because:

- Per-column RLS in Postgres is painful (one row, 250+ cols, different visibility per role).
- Sparse data (students don't have salary, employees don't have parent guardian fields).
- Lock contention across unrelated updates.

The chosen "keep `users + user_profiles + minimal role-extensions`" pattern matches how the referral system already works (`referral_codes`, `referral_usages`, `referral_rewards` are role-agnostic extensions of `users` keyed by `user_id`).

## The trimmed `instructor_profiles` keep list (30 cols)

```
id, user_id, instructor_code, instructor_type, badge,
approval_status, approved_at, approved_by, rejection_reason,
is_active, is_verified, is_featured,
gstin, pan_number, pan_verified,
payment_model, payment_currency, hourly_rate,
fixed_rate_per_course, revenue_share_percentage,
total_earnings, pending_earnings, total_paid_out,
average_rating, total_reviews_received,
created_at, updated_at, deleted_at, created_by, updated_by
```

These are the columns touched by the Phase 8 invoice, Phase 9 payout/TDS, and review-rating code paths. Everything else was deadweight.

## Migrations applied (via Supabase MCP, mirrored in `sql/`)

| Order | Migration                                            | What it does |
|---|---|---|
| 1 | `phase13_drop_employee_profiles`                     | `DROP TABLE public.employee_profiles CASCADE` |
| 2 | `phase13_drop_student_profiles`                      | `DROP TABLE public.student_profiles CASCADE` |
| 3 | `phase13_trim_instructor_profiles`                   | `ALTER TABLE … DROP COLUMN …` × 32 |
| 4 | `phase13_fn_search_instructors_post_trim_v2`         | rebuild `fn_search_instructors` minus `tagline` + `instructor_bio` |

## Code surgeries (API)

- `src/app.ts` — removed the route mounts for `/employee-profiles` and `/student-profiles`.
- `src/modules/employee-profiles/` — **directory deleted**.
- `src/modules/student-profiles/` — **directory deleted**.
- `src/modules/instructor-profiles/instructorProfile.controller.ts` — drop-list fields filtered in `parseBody`, list-page filters trimmed.
- `src/modules/ai/ai.controller.ts` — `MasterModule` union shrunk, `VALID_MASTER_MODULES` shrunk, context fetcher + prompt builder for `instructor_profiles` rewritten for the trimmed schema, `employee_profiles` and `student_profiles` cases removed.
- `src/services/postPayment.service.ts` — `updateStudentProfile` → no-op; `processReferralRewards` → no-op (waits for proper attribution column on `users`).
- `src/modules/issued-certificates/issuedCertificate.controller.ts` — `certificates_earned` increment/decrement removed.
- `src/modules/user-badges/userBadge.controller.ts` — `total_badges_earned` + `xp_points` increment/decrement removed.
- `src/types/database.ts` — regenerated from live schema after migrations.

## Code surgeries (admin portal)

- `app/(admin)/employee-profiles/` — **directory deleted**.
- `app/(admin)/student-profiles/` — **directory deleted**.
- `components/profile-tabs/EmployeeProfileTab.tsx`, `StudentProfileTab.tsx` — **deleted**.
- `components/layout/Sidebar.tsx` — Employee/Student nav entries removed.
- `lib/api.ts` — Employee/Student CRUD helper methods removed.
- `components/ui/AiMasterDialog.tsx` — `employee_profiles` + `student_profiles` prompt presets removed.
- `app/(admin)/users/[id]/profile/page.tsx` — Employee/Student tabs removed from the tab list and the render switch.

## Counters lost (recompute formula if you ever need them)

| Was on `student_profiles` | Compute now from |
|---|---|
| `courses_enrolled` | `SELECT COUNT(*) FROM enrollments WHERE user_id = ? AND deleted_at IS NULL` |
| `courses_completed` | `… AND completion_status = 'completed'` |
| `certificates_earned` | `SELECT COUNT(*) FROM issued_certificates WHERE user_id = ? AND revoked_at IS NULL` |
| `total_badges_earned` | `SELECT COUNT(*) FROM user_badges WHERE user_id = ?` |
| `xp_points` | `SELECT SUM(b.xp_reward) FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ?` |
| `total_amount_paid` | `SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = ? AND payment_status = 'paid'` |

## Rollback recipe

If you ever need any of these tables back:

1. Open `sql/PHASE13_PRE_DROP_SNAPSHOT.sql` — it contains every row as commented JSON.
2. Re-create the table from `sql/_baseline_2026_05_13.sql` (the live-schema dump captured at Phase 6.2).
3. `INSERT INTO …` from the JSON snapshot.

Since live data was 7 rows of test data, this is purely insurance.

## What this phase doesn't break

- 33/33 unit tests still pass.
- `tsc --noEmit` clean on both projects.
- Payout pipeline (Phase 9): instructor financial state still lives where it always did, just on fewer columns.
- Invoice / tax cert generation (Phase 8): still reads `gstin`, `pan_number`, `pan_verified`.
- Search (Phase 11.5): `fn_search_instructors` rebuilt without `tagline` / `instructor_bio`, now matches on display name only.
- Referral system: dedicated `referral_codes` / `referral_usages` / `referral_rewards` tables stay live (0 rows, untouched).
