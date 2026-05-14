-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ─────────────────────────────────────────────────────────────────
-- Phase 13 — Pre-drop snapshot (2026-05-13)
--
-- This file captures every row of `employee_profiles`, `student_profiles`,
-- and `instructor_profiles` before the destructive Phase 13 migrations run.
--
-- Total: 1 + 4 + 2 = 7 rows of test/dev data.
--
-- If we need to restore any data, the JSON below is the source of truth.
-- See sql/PHASE13_PROFILE_CONSOLIDATION.md §"Rollback" for the recipe.
-- ─────────────────────────────────────────────────────────────────

/* ── employee_profiles (1 row) ──
[
  {"id":2,"user_id":13,"branch_id":12,"exit_type":"absconding","is_active":true,"pay_grade":"l5","pf_number":"45","work_mode":"on_site","ctc_annual":4,"esi_number":"56","shift_type":"afternoon","tax_regime":"old","uan_number":"45","exit_reason":"demoo none","joining_date":"2026-04-14","payment_mode":"bank_transfer","department_id":12,"employee_code":"emp01","employee_type":"temporary","work_location":"demoloc","designation_id":16,"has_vpn_access":false,"laptop_asset_id":"4567","salary_currency":"INR","weekly_off_days":"saturday,sunday","has_email_access":false,"confirmation_date":"2026-04-16","contract_end_date":"2026-04-30","has_system_access":true,"access_card_number":"dvvdsx","leave_balance_sick":2,"notice_period_days":20,"probation_end_date":"2026-05-06","exit_interview_done":false,"full_and_final_done":true,"basic_salary_monthly":3,"leave_balance_casual":2,"leave_balance_earned":2,"experience_at_joining":-1,"total_experience_years":3,"leave_balance_compensatory":1,"created_by":13,"updated_by":13,"created_at":"2026-04-20T15:52:48.381405+05:30","updated_at":"2026-04-20T15:53:45.793359+05:30"}
]
*/

/* ── student_profiles (4 rows) ──
[
  {"id":1,"level":1,"user_id":19,"is_active":true,"enrollment_date":"2026-04-13","enrollment_type":"trial","enrollment_number":"1234","learning_goal_id":25,"specialization_id":16,"subscription_plan":"basic","education_level_id":6,"current_institution":"GUM","current_field_of_study":"IT","current_semester_or_year":"2nd year","is_seeking_job":true,"is_open_to_freelance":true,"is_open_to_internship":true,"preferred_job_roles":"frontend","preferred_locations":"surat","expected_salary_range":"678923","parent_guardian_name":"Bhumika ","parent_guardian_email":"bhumikarana5725@gmail.com","parent_guardian_phone":"+911234567890","parent_guardian_relation":"sibling","has_active_subscription":true,"daily_learning_hours":2,"weekly_available_days":6,"preferred_content_type":"video","preferred_learning_mode":"hybrid","preferred_learning_language_id":7,"created_by":13,"updated_by":19},
  {"id":3,"level":1,"user_id":23,"is_active":true,"enrollment_date":"2026-04-06","enrollment_type":"self","enrollment_number":"1","subscription_plan":"free","education_level_id":8,"current_institution":"GUM","current_field_of_study":"IT","daily_learning_hours":2,"weekly_available_days":3,"difficulty_preference":"beginner","preferred_content_type":"video","preferred_learning_mode":"self_paced","created_by":19},
  {"id":4,"level":1,"user_id":15,"is_active":true,"enrollment_date":"2026-04-05","enrollment_type":"self","enrollment_number":"420","subscription_plan":"free","education_level_id":8,"current_institution":"GUM","current_field_of_study":"IT","daily_learning_hours":4,"weekly_available_days":7,"difficulty_preference":"beginner","preferred_content_type":"video","preferred_learning_mode":"self_paced","created_by":19},
  {"id":5,"level":1,"user_id":13,"is_active":true,"enrollment_date":"2026-01-01","enrollment_type":"scholarship","enrollment_number":"ENR-420","subscription_plan":"standard","education_level_id":6,"current_institution":"r&w","current_field_of_study":"BCA","daily_learning_hours":2,"weekly_available_days":5,"difficulty_preference":"intermediate","preferred_content_type":"video","preferred_learning_mode":"instructor_led","created_by":15}
]
*/

/* ── instructor_profiles (2 rows) ──
[
  {"id":1,"badge":"rising","tagline":"NJ","user_id":15,"branch_id":12,"is_active":true,"hourly_rate":1,"is_featured":true,"is_verified":true,"is_available":true,"joining_date":"2026-01-01","pan_verified":false,"department_id":16,"payment_model":"fixed_per_course","teaching_mode":"offline","available_from":"2026-01-01","demo_video_url":"ADAS","designation_id":8,"instructor_bio":"Kashsddkj","total_earnings":0,"total_paid_out":0,"approval_status":"approved","available_until":"2027-01-01","instructor_code":"INS-001","instructor_type":"external","payment_currency":"INR","pending_earnings":0,"specialization_id":15,"preferred_time_slots":"mon","fixed_rate_per_course":1,"highest_qualification":"J","awards_and_recognition":"BHJ","certifications_summary":"JHB","max_concurrent_courses":15,"total_experience_years":2,"available_hours_per_week":1,"revenue_share_percentage":30,"industry_experience_years":1,"teaching_experience_years":1,"secondary_specialization_id":14,"preferred_teaching_language_id":12,"created_by":15,"updated_by":15},
  {"id":4,"badge":"elite","tagline":"expert","user_id":13,"branch_id":3,"is_active":true,"hourly_rate":486,"is_featured":true,"is_verified":false,"is_available":false,"joining_date":"2026-04-21","pan_verified":false,"department_id":16,"payment_model":"hourly","teaching_mode":"hybrid","available_from":"2026-04-22","demo_video_url":"fchg","designation_id":8,"instructor_bio":"RFGTYUHUJ","total_earnings":0,"total_paid_out":0,"approval_status":"pending","available_until":"2026-05-07","instructor_code":"1","instructor_type":"internal","payment_currency":"INR","pending_earnings":0,"specialization_id":12,"preferred_time_slots":"mon","fixed_rate_per_course":100,"highest_qualification":"fchg","awards_and_recognition":"hjvg","certifications_summary":"gvtyuj","max_concurrent_courses":-1,"total_experience_years":4,"available_hours_per_week":4,"revenue_share_percentage":10,"industry_experience_years":2,"teaching_experience_years":2,"secondary_specialization_id":14,"preferred_teaching_language_id":12,"created_by":13,"updated_by":13}
]
*/

-- No-op SQL block — file is documentation only.
SELECT 1 WHERE false;