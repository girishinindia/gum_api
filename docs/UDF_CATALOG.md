# UDF Catalog

Phase 11.4.5 — auto-generated snapshot of every Postgres function the API codebase calls, where it's called, and how it's classified.

Last refreshed: **2026-05-13**.

## How to regenerate

```bash
# 1. Pull latest function list from live Supabase
#    (via the Supabase MCP `execute_sql` tool in this session):
#    SELECT n.nspname, p.proname, pg_get_function_arguments(p.oid), …
# 2. Grep call sites:
grep -RnE "db\\.callFn\\(\\s*['\"]" src \
  | sed -E "s|^([^:]+):([0-9]+):.*db\\.callFn\\([[:space:]]*['\"]([^'\"]+)['\"].*|\\3\\t\\1:\\2|" \
  | sort > /tmp/udf-sites.txt
# 3. Merge by hand into the table below.
```

## Classification

- **app-callable** — invoked from Node code through `db.callFn(...)`. Lives in `src/services/db.ts`.
- **indirect** — routed via a wrapper (`activityLog.service.rpcSafe`). Function name is a runtime variable, so grep-based call-site detection won't find it. Listed manually.
- **trigger** — fires from a `BEFORE`/`AFTER` row trigger; never called from app code.
- **dead** — code references a function that does not exist in the live DB. Documented for cleanup.

## App-callable functions

| Function                            | Sec     | Lang     | Call sites |
|-------------------------------------|---------|----------|------------|
| `change_password`                   | DEFINER | plpgsql  | `src/modules/auth/auth.controller.ts:353` |
| `create_session`                    | DEFINER | plpgsql  | `auth.controller.ts:91`, `:153`, `:176` |
| `create_verified_user`              | DEFINER | plpgsql  | `auth.controller.ts:87` |
| `find_user_for_login`               | DEFINER | plpgsql  | `auth.controller.ts:135` |
| `fn_claim_payment_step`             | INVOKER | plpgsql  | `services/postPayment.service.ts:47` |
| `fn_complete_payment_step`          | INVOKER | sql      | `services/postPayment.service.ts:66` |
| `fn_fail_payment_step`              | INVOKER | sql      | `services/postPayment.service.ts:74` |
| `fn_generate_tax_invoice_no`        | INVOKER | plpgsql  | `services/invoice.service.ts:285` |
| `fn_generate_tds_certificate_no`    | INVOKER | plpgsql  | `modules/payout-requests/payoutRequest.controller.ts:234` |
| `fn_refresh_revenue_daily`          | DEFINER | plpgsql  | `cron/jobs/revenueDailyRefresh.ts:13`, `modules/admin-revenue/adminRevenue.controller.ts:64` |
| `fn_search_courses`                 | DEFINER | sql      | `modules/search/search.controller.ts:28` |
| `fn_search_instructors`             | DEFINER | sql      | `modules/search/search.controller.ts:44` |
| `fn_wallet_credit`                  | INVOKER | plpgsql  | `services/wallet.service.ts:126` |
| `fn_wallet_debit`                   | INVOKER | plpgsql  | `services/wallet.service.ts:165` |
| `fn_wallet_reconcile_check`         | INVOKER | sql      | `cron/jobs/walletReconciliation.ts:31` |
| `fn_get_or_create_wallet`           | INVOKER | plpgsql  | _(unused in code; called internally by `fn_wallet_credit`)_ |
| `is_email_available`                | DEFINER | sql      | `auth.controller.ts:22` |
| `is_mobile_available`               | DEFINER | sql      | `auth.controller.ts:25` |
| `revoke_all_sessions`               | DEFINER | plpgsql  | `modules/users/user.controller.ts:301` |
| `revoke_session`                    | DEFINER | plpgsql  | `auth.controller.ts:175` |
| `udf_sync_all_table_summaries`      | DEFINER | plpgsql  | `modules/table-summary/tableSummary.controller.ts:37` |
| `udf_sync_table_summary`            | DEFINER | plpgsql  | `modules/table-summary/tableSummary.controller.ts:15`, `:50` |
| `update_login_failure`              | DEFINER | plpgsql  | `auth.controller.ts:145` |
| `update_login_success`              | DEFINER | plpgsql  | `auth.controller.ts:152` |
| `verify_refresh_session`            | DEFINER | plpgsql  | `auth.controller.ts:169` |
| `check_permission`                  | DEFINER | plpgsql  | _(unused in code; available for RBAC RPC if needed)_ |
| `get_user_role_level`               | DEFINER | sql      | _(unused in code)_ |
| `user_owns_resource`                | DEFINER | sql      | _(unused in code)_ |
| `udf_register_summary_trigger`      | DEFINER | plpgsql  | _(admin-tooling, called manually)_ |
| `udf_seed_summary_row`              | DEFINER | plpgsql  | _(admin-tooling, called manually)_ |

## Indirect (via `activityLog.service.rpcSafe`)

| Function                  | Sec     | Lang     | Wrapped by                                   |
|---------------------------|---------|----------|----------------------------------------------|
| `log_admin_activity`      | DEFINER | plpgsql  | `logAdmin()`                                 |
| `log_auth_activity`       | DEFINER | plpgsql  | `logAuth()`                                  |
| `log_data_activity`       | DEFINER | plpgsql  | `logData()` + `logStorage()`                 |
| `log_system_activity`     | DEFINER | plpgsql  | `logSystem()`                                |

## Trigger functions (no call sites — fired by Postgres triggers)

`fn_manage_table_summary`, `generate_invoice_number`, `generate_order_number`, `generate_refund_number`, `generate_transaction_number`, `set_updated_at`, `update_timestamp`, `update_updated_at`, `update_updated_at_column`, `update_user_education_updated_at`, `update_user_profiles_updated_at`.

## Dead RPCs (function does NOT exist in live DB — cleanup needed)

| Call site                                                                  | Function attempted              |
|----------------------------------------------------------------------------|---------------------------------|
| `src/services/postPayment.service.ts:461`                                  | `increment_coupon_usage`        |
| `src/modules/checkout/checkout.controller.ts:237`                          | `increment_coupon_usage`        |
| `src/modules/referral-usages/referralUsage.controller.ts:77`               | `increment_field`               |
| `src/modules/discussion-replies/discussionReply.controller.ts:84`          | `increment_field`               |

These four sites attempt to call functions that don't exist in the database. Errors are currently swallowed via `.maybeSingle()` or sit inside try/catch — coupon usage counts and discussion reply counters silently never increment. Followup: either create the missing UDFs or do the counter increment inline as an UPDATE.

## What's outside this catalog

- All `regexp_*`, `replace`, `split_part`, `strpos`, `translate` overloads — these are `citext` operator overloads shipped by the `citext` extension (owned by `supabase_admin`). Used implicitly via SQL operators, not via RPC.
- Internal helpers called from inside other PL/pgSQL bodies (e.g. `fn_wallet_credit` calls `fn_get_or_create_wallet`). Not surfaced in app code so they're documented above as "unused in code."
