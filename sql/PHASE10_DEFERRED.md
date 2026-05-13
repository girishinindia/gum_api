# Phase 10 — Deferred Items

This document records the engineering items consciously deferred out of Phase 10 (Quality, validation, tests, CI). Each item is either tracked for a follow-up phase or left intentionally because the cost/benefit is poor right now.

Last updated: 2026-05-13 (post Phase 10.6).

---

## 1. Full Zod coverage across all 157 modules

**Status:** deferred to Phase 11+.

**What was done in Phase 10:**

- `validate(...)` middleware is wired into every Phase 7–9 module that has a mutating request body, which in practice is just `bank-accounts` (`POST /` and `PATCH /:id`).
- The remaining Phase 7–9 modules either take only URL params (`verify`, `instructor-payouts`, `admin-queues`) or are HMAC-verified by upstream providers (`webhooks/bunny-stream`, `webhooks/razorpayx`).
- Phase 10.6 (`admin-revenue`) uses an inline Zod schema for the query string.

**What is still missing:**

The pre-existing 145+ modules (cities, courses, enrollments, lessons, orders, coupons, …) have either a hand-rolled `req.body` check or no validation at all on their POST/PATCH handlers. The pattern to fix this exists (`src/middleware/validate.ts`, every Phase 7–9 module follows it), but a full sweep needs to:

1. Read every `<module>.controller.ts` POST/PATCH/PUT.
2. Write a matching `<module>.schema.ts` exporting `create…Schema` and `update…Schema`.
3. Wire `validate(...)` into `<module>.routes.ts` between RBAC and the controller.
4. Add a focused supertest case proving the 400 response shape.

Recommended batching: do it module-by-module as part of normal feature work, not as a separate large PR.

---

## 2. OpenAPI / API documentation rollout (`zod-to-openapi`)

**Status:** dependency installed conceptually but not wired.

The cleanest path once Zod coverage is broad is to use `@asteasolutions/zod-to-openapi` to generate `/api/v1/openapi.json` from the same schemas the validate middleware uses. This avoids the "hand-written API docs that drift from reality" failure mode.

**Blockers:**

- Need item #1 done first, or the spec will be incomplete.
- Need a decision on whether to publish docs externally (Swagger UI mount) or keep them internal (admin portal only).

---

## 3. End-to-end supertest suite against Supabase local

**Status:** deferred — Phase 10 ships unit tests only.

**What we have:** 27 unit tests covering pure functions in `services/` and `utils/`. These run in <10s, no DB, no Redis.

**What's missing:** integration tests that actually:

- Boot the Express app with `import app from '../src/app'`.
- Talk to a real `supabase` schema (either a CI-only test project, or `supabase start` locally).
- Hit golden-path routes: signup → login → create order → simulate Razorpay webhook → assert wallet credit + invoice row + enrollment row.

This is the highest-leverage test category for catching regressions in the post-payment orchestrator, payouts, and idempotency layers. The Phase 7–9 work has already made the code testable (every effectful operation goes through a service that can be stubbed), so the remaining cost is mostly in CI infrastructure: spinning up Postgres + Redis for each PR.

**Recommended next step:** add a `docker compose -f docker-compose.test.yml up -d` step to `.github/workflows/ci.yml` that boots a disposable Postgres seeded from `sql/_baseline_2026_05_13.sql`, then runs `npm run test:e2e`.

---

## 4. The 334 "unused" indexes flagged by `pg_stat_user_indexes`

**Status:** intentionally deferred at Phase 5.5.

Reason: `idx_scan = 0` only means "this index has not been used since the last stats reset." Several months of production traffic is needed before deciding it's safe to drop them. Re-evaluate quarterly with:

```sql
SELECT schemaname, relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_stat_user_indexes
 WHERE schemaname = 'public' AND idx_scan = 0
 ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## 5. Sentry release/source-map upload — **DONE in 12.1 (2026-05-13)**

CI now uploads source maps to Sentry on every `push` to `main`, then strips the `*.map` files from the production artefact. Source maps live in Sentry only.

**Required GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret              | Value                                      | Source                                       |
|---------------------|--------------------------------------------|----------------------------------------------|
| `SENTRY_AUTH_TOKEN` | Sentry internal-integration auth token     | Sentry → Settings → Auth Tokens (scope: `project:releases`, `project:read`, `project:write`) |
| `SENTRY_ORG`        | Your Sentry organisation slug              | Sentry URL, e.g. `growupmore`                |
| `SENTRY_PROJECT`    | Sentry project slug                        | Sentry → Projects, e.g. `gum-api`            |

**Production runtime env** (already wired in `src/config/index.ts`):

```
SENTRY_DSN=https://…@sentry.io/…
SENTRY_RELEASE=<git_sha>            # set this to the same SHA the CI uploaded against
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05
```

If `SENTRY_AUTH_TOKEN` isn't set in repo secrets, the upload step skips silently (no failed builds for fork PRs).

---

## 6. Prometheus scraper / Grafana dashboards

**Status:** `/metrics` endpoint exists, no consumer.

The endpoint returns Prometheus-format text and is unauthenticated by design (the platform should restrict reach via network policy rather than app auth). Need to:

1. Point Prometheus / Grafana Cloud at `https://api.growupmore.com/metrics`.
2. Build dashboards for: `http_requests_total`, `bullmq_queue_*`, `payment_*`, `payout_*`.
3. Set up alert rules: failed jobs > N/min, payout pending > 2h, wallet reconciliation drift.

---

## 7. Admin portal wiring for new endpoints

**Status:** API ships, admin UI not updated.

The following endpoints have no admin-portal UI:

- `/admin/queues` (Phase 7.7) — BullMQ health + retry buttons
- `/admin/revenue/daily` (Phase 10.6) — revenue chart
- `/admin/revenue/refresh` — force MV refresh
- `/verify/cert/:cert_number` — public, no admin UI needed
- `/bank-accounts` — instructor self-serve, partial admin UI exists
- `/instructor-payouts/:id/tds-statement` — needs FY picker + PDF export

All are gated behind the right RBAC and respond with the same envelope as the rest of the API, so wiring them is straightforward Next.js work.

---

## 8. Auto-issue invoice PDF on webhook (currently enqueued, never polled by admin)

**Status:** PDFs are generated and uploaded to Supabase Storage, but the admin portal doesn't surface a "download invoice" button on the order detail page yet. The `invoices.png_url` and `invoices.pdf_url` columns are already populated by the `pdf-generation` worker.

---

## 9. Materialised views beyond `v_revenue_daily`

Phase 10.6 adds the daily revenue MV. Other candidates considered and deferred:

- **`v_instructor_earnings_daily`** — daily payout/earnings split per instructor. Defer: low cardinality, the existing `instructor_profile_sync` cron computes this cheaply.
- **`v_course_funnel_daily`** — view → enrollment → completion rates. Defer: blocked on lifecycle events table.
- **`v_active_users_daily`** — DAU/WAU/MAU. Defer: depends on a unified activity table that doesn't exist yet.

---

## Open follow-ups for the human

These need decisions, not code:

| Item                                                                             | Decision needed                                          | Blocking what                |
|----------------------------------------------------------------------------------|----------------------------------------------------------|------------------------------|
| RazorpayX live credentials                                                       | When do we flip `PAYOUT_GATEWAY=razorpayx` in prod?      | Real payouts                 |
| Supabase Storage bucket for `invoices/` and `certificates/`                      | Confirm public-read on `certificates/`, private on others| PDF URLs being correct       |
| Sentry org / project name                                                        | Confirm so source-map upload can be wired                | Source maps                  |
| Test Supabase project                                                            | Spin up a second project for CI integration tests?       | Item #3 above                |
| Bunny library `WebhookUrl` field                                                 | Verify it's pointing at `…/api/v1/webhooks/bunny-stream` | Encoding-status events       |
