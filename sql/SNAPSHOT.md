# Live Schema Snapshot · 2026-05-13

Captured from the live Supabase project `ixygmsqbpyyvjhxphpso`
(*Genius ITens Project*, region `ap-south-1`) via Supabase MCP, at the end
of **Phase 5** of the GrowUpMore backend hardening plan.

## Counts at a glance

| Object | Count |
|---|---:|
| Base tables (public) | **176** |
| Views (public) | 4 |
| Functions (public, app + extension) | 159 |
| Indexes (public) | 1,081 |
| RLS policies (public) | 29 |
| Triggers (public) | 215 |
| RLS-enabled tables (public) | **176 of 176** |
| Extensions in `public` schema | 5 (`citext`, `pg_trgm`, `pgcrypto`, `unaccent`, `pg_stat_statements`) |
| Supabase migrations applied (oldest → newest) | **210** (`20260411154927` → `20260513092907`) |

## Why this matters

The repo's `/sql/*.sql` files describe roughly **106 tables** across **48
numbered migration files** (`01_rbac.sql` through `47_add_trgm_gin_indexes.sql`).
The live database has **176 tables**. That ~70-table drift accumulated as
Supabase MCP migrations were applied directly without mirrored files.

**Source of truth, from this snapshot forward:**
1. The Supabase MCP `apply_migration` history is the canonical record.
2. Every new migration applied via MCP is **also** committed as a numbered
   `.sql` file in this folder using the naming convention defined in
   [`README.md`](./README.md).
3. The legacy `01_*.sql` … `47_*.sql` files stay as **historical reference**;
   they are NOT replayable as-is against the current schema (they would error
   on already-existing objects).

## All public tables (alphabetical)

```
admin_activity_log               instructor_earnings              session_attendance
announcement_reads               instructor_profiles              session_recordings
announcements                    instructor_promotion_courses     skills
assesment_capstone_projects      instructor_promotions            social_medias
assesment_capstone_projects_solution invoices                     specializations
assesment_capstone_projects_translations issued_certificates      states
assesment_exercise               languages                        sticker_categories
assesment_exercise_translations  learning_goals                   stickers
assesment_mini_projects          live_sessions                    student_profiles
assesment_mini_projects_solution login_sessions                   sub_categories
assesment_mini_projects_translations matching_pair_translations   sub_category_translations
assessment_attachment_translations matching_pairs                 sub_topic_translations
assessment_attachments           matching_question_translations   sub_topics
assessment_solution_translations matching_questions               subject_translations
assessment_solutions             mcq_option_translations          subjects
assessment_translations          mcq_options                      support_tickets
assessments                      mcq_question_translations        system_activity_log
auth_activity_log                mcq_questions                    table_summary
badges                           notification_preferences         ticket_attachments
batch_translations               notifications                    ticket_categories
blog_categories                  one_word_question_translations   ticket_messages
blog_posts                       one_word_questions               ticket_priorities
blog_reviews                     one_word_synonym_translations    ticket_status_history
branch_departments               one_word_synonyms                topic_translations
branches                         order_items                      topics
bundle_courses                   ordering_item_translations       transactions
bundle_translations              ordering_items                   user_badges
bundles                          ordering_question_translations   user_documents
cart_items                       ordering_questions               user_education
categories                       orders                           user_experience
category_translations            payments                         user_languages
certificate_templates            payout_requests                  user_permissions
chapter_translations             payout_settlements               user_profiles
chapters                         permissions                      user_projects
chat_attachments                 policies                         user_roles
chat_invites                     policy_translations              user_skills
chat_message_reactions           policy_type_translations         user_social_medias
chat_messages                    policy_types                     users
chat_read_receipts               post_payment_steps               video_watch_history
chat_room_members                project_submissions              wallet_transactions
chat_rooms                       quick_replies                    wallets
cities                           quiz_answers                     webhook_events
countries                        quiz_attempts                    webinar_translations
coupon_batches                   referral_codes                   webinars
coupon_bundles                   referral_rewards                 wishlists
coupon_courses                   referral_usages                  youtube_descriptions
coupon_webinars                  refunds                          youtube_url_archive
coupons                          resource_access
course_batches                   review_helpfulness
course_chapter_topics            reviews
course_chapters                  role_permissions
course_module_subjects           roles
course_module_translations
course_modules
course_sub_categories
course_translations
courses
custom_emojis
data_activity_log
departments
descriptive_question_translations
descriptive_questions
designations
discussion_replies
discussion_threads
document_types
documents
education_levels
email_templates
emoji_categories
employee_profiles
enrollment_progress
enrollments
faq_categories
faq_category_translations
faq_translations
faqs
```

## Application-owned functions (40)

Excludes 119+ extension-owned functions from `citext`, `pgcrypto`,
`pg_trgm`, `unaccent`, `pg_stat_statements`.

| Domain | Functions |
|---|---|
| Auth & sessions | `change_password`, `create_session`, `create_verified_user`, `find_user_for_login`, `is_email_available`, `is_mobile_available`, `revoke_session`, `revoke_all_sessions`, `update_login_failure`, `update_login_success`, `verify_refresh_session` |
| RBAC | `check_permission`, `get_user_role_level`, `user_owns_resource` |
| Audit logs | `log_admin_activity`, `log_auth_activity`, `log_data_activity`, `log_system_activity` |
| Number generators | `generate_invoice_number`, `generate_order_number`, `generate_refund_number`, `generate_transaction_number` |
| Wallet (Phase 2) | `fn_get_or_create_wallet`, `fn_wallet_credit`, `fn_wallet_debit`, `fn_wallet_reconcile_check` |
| Post-payment steps (Phase 2) | `fn_claim_payment_step`, `fn_complete_payment_step`, `fn_fail_payment_step` |
| Trigger helpers | `set_updated_at`, `update_timestamp`, `update_updated_at`, `update_updated_at_column`, `update_user_education_updated_at`, `update_user_profiles_updated_at` |
| Table summary | `fn_manage_table_summary`, `udf_register_summary_trigger`, `udf_seed_summary_row`, `udf_sync_all_table_summaries`, `udf_sync_table_summary` |

All 40 have `search_path = pg_catalog, public` pinned as of Phase 1.

## Recent migrations (last 25 applied)

```
20260513092907  phase5_fix_auth_role_initplan_policies
20260513092809  phase5_drop_indexes_shadowed_by_unique
20260513092720  phase5_drop_duplicate_indexes_v2
20260513092611  phase5_drop_duplicate_indexes
20260513092302  phase5_index_unindexed_fks_residual
20260513091921  phase5_index_unindexed_foreign_keys
20260513084849  phase2_post_payment_steps
20260513084717  phase2_wallet_atomic_udfs
20260513084435  phase2_webhook_events_table
20260513084004  phase1_make_views_security_invoker
20260513083900  phase1_revoke_execute_from_public_on_definer_rpcs
20260513083809  phase1_revoke_anon_execute_on_definer_rpcs
20260513083644  phase1_harden_function_search_path
20260513083521  phase1_drop_always_true_policies
20260513083441  phase1_enable_rls_on_62_tables
20260513065540  phase0_drop_pg_graphql_extension
20260513065400  phase0_revoke_graphql_from_anon_authenticated
20260512235957  add_trgm_gin_indexes_for_search
20260512210459  46c_final_activity_log_constraint
20260512210338  46b_announcements_wallets_permissions_summary
20260512210312  46a_announcements_wallets_tables
20260512210226  45d_chat_table_summary_fix
20260512210201  45c_chat_rls_triggers
20260512210128  45b_chat_stickers_emojis_quickreplies
20260512210117  45a_chat_core_tables
```

## Security posture (post-Phase 1)

| Lint | Count |
|---|---:|
| Security ERROR | **0** |
| Security WARN | **5** (the 5 `extension_in_public` items — deferred) |
| Security INFO | 151 (`rls_enabled_no_policy` on locked tables; service-role only) |
| Performance WARN/ERROR | **0** |
| Performance INFO | 584 (`unused_index` — needs prod stats; deferred) |

## Going forward

See [`README.md`](./README.md) in this folder for the contribution workflow.
