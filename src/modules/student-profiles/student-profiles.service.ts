import { db } from '../../database/db';
import { buildPaginationMeta } from '../../core/utils/api-response';
import type { PaginationMeta } from '../../core/types/common.types';
import type {
  ListStudentProfilesQuery,
  CreateStudentProfileBody,
  UpdateStudentProfileBody,
} from './student-profiles.schemas';

// ═══════════════════════════════════════════════════════════════
// Internal row type — mirrors udf_get_student_profiles output
// ═══════════════════════════════════════════════════════════════

interface StudentProfileRow {
  stu_id: number | string;
  stu_user_id: number | string;
  stu_enrollment_number: string;
  stu_enrollment_date: Date | string;
  stu_enrollment_type: string;
  stu_education_level_id: number | string | null;
  stu_current_institution: string | null;
  stu_current_field_of_study: string | null;
  stu_current_semester_or_year: string | null;
  stu_expected_graduation_date: Date | string | null;
  stu_is_currently_studying: boolean;
  stu_learning_goal_id: number | string | null;
  stu_specialization_id: number | string | null;
  stu_preferred_learning_mode: string | null;
  stu_preferred_learning_language_id: number | string | null;
  stu_preferred_content_type: string | null;
  stu_daily_learning_hours: number | string | null;
  stu_weekly_available_days: number | null;
  stu_difficulty_preference: string | null;
  stu_parent_guardian_name: string | null;
  stu_parent_guardian_phone: string | null;
  stu_parent_guardian_email: string | null;
  stu_parent_guardian_relation: string | null;
  stu_courses_enrolled: number;
  stu_courses_completed: number;
  stu_courses_in_progress: number;
  stu_certificates_earned: number;
  stu_total_learning_hours: number | string;
  stu_average_score: number | string | null;
  stu_current_streak_days: number;
  stu_longest_streak_days: number;
  stu_xp_points: number;
  stu_level: number;
  stu_subscription_plan: string | null;
  stu_subscription_start_date: Date | string | null;
  stu_subscription_end_date: Date | string | null;
  stu_total_amount_paid: number | string;
  stu_has_active_subscription: boolean;
  stu_referred_by_user_id: number | string | null;
  stu_referral_code: string | null;
  stu_is_seeking_job: boolean;
  stu_preferred_job_roles: string | null;
  stu_preferred_locations: string | null;
  stu_expected_salary_range: string | null;
  stu_resume_url: string | null;
  stu_portfolio_url: string | null;
  stu_is_open_to_internship: boolean;
  stu_is_open_to_freelance: boolean;
  stu_created_by: number | string | null;
  stu_updated_by: number | string | null;
  stu_is_active: boolean;
  stu_is_deleted: boolean;
  stu_created_at: Date | string;
  stu_updated_at: Date | string;
  stu_deleted_at: Date | string | null;
  // User columns
  user_first_name: string;
  user_last_name: string;
  user_email: string;
  user_mobile: string | null;
  user_role_id: number | string;
  role_name: string;
  user_is_active: boolean;
  user_is_deleted: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
  // Education level
  education_level_name: string | null;
  education_level_abbreviation: string | null;
  education_level_category: string | null;
  // Learning goal
  learning_goal_name: string | null;
  // Specialization
  specialization_name: string | null;
  specialization_category: string | null;
  // Preferred learning language
  preferred_learning_language_name: string | null;
  preferred_learning_language_native_name: string | null;
  // Referrer
  referrer_first_name: string | null;
  referrer_last_name: string | null;
  referrer_email: string | null;
  // Pagination
  total_count: number | string;
}

// ═══════════════════════════════════════════════════════════════
// Public DTO
// ═══════════════════════════════════════════════════════════════

export interface StudentProfileDto {
  id: number;
  userId: number;
  enrollmentNumber: string;
  enrollmentDate: string;
  enrollmentType: string;
  // Education
  educationLevelId: number | null;
  educationLevelName: string | null;
  educationLevelAbbreviation: string | null;
  educationLevelCategory: string | null;
  currentInstitution: string | null;
  currentFieldOfStudy: string | null;
  currentSemesterOrYear: string | null;
  expectedGraduationDate: string | null;
  isCurrentlyStudying: boolean;
  // Learning preferences
  learningGoalId: number | null;
  learningGoalName: string | null;
  specializationId: number | null;
  specializationName: string | null;
  specializationCategory: string | null;
  preferredLearningMode: string | null;
  preferredLearningLanguageId: number | null;
  preferredLearningLanguageName: string | null;
  preferredLearningLanguageNativeName: string | null;
  preferredContentType: string | null;
  dailyLearningHours: number | null;
  weeklyAvailableDays: number | null;
  difficultyPreference: string | null;
  // Parent / guardian
  parentGuardianName: string | null;
  parentGuardianPhone: string | null;
  parentGuardianEmail: string | null;
  parentGuardianRelation: string | null;
  // Academic performance
  coursesEnrolled: number;
  coursesCompleted: number;
  coursesInProgress: number;
  certificatesEarned: number;
  totalLearningHours: number;
  averageScore: number | null;
  currentStreakDays: number;
  longestStreakDays: number;
  xpPoints: number;
  level: number;
  // Financial
  subscriptionPlan: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  totalAmountPaid: number;
  hasActiveSubscription: boolean;
  referredByUserId: number | null;
  referrerFirstName: string | null;
  referrerLastName: string | null;
  referrerEmail: string | null;
  referralCode: string | null;
  // Placement / career
  isSeekingJob: boolean;
  preferredJobRoles: string | null;
  preferredLocations: string | null;
  expectedSalaryRange: string | null;
  resumeUrl: string | null;
  portfolioUrl: string | null;
  isOpenToInternship: boolean;
  isOpenToFreelance: boolean;
  // Audit
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Parent user (inherited status)
  user: {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string | null;
    roleId: number;
    roleName: string;
    isActive: boolean;
    isDeleted: boolean;
    isEmailVerified: boolean;
    isMobileVerified: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

const toNum = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const toIso = (v: Date | string | null | undefined): string | null =>
  v == null ? null : typeof v === 'string' ? v : v.toISOString();

const toIsoDate = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : v.toISOString();
  return s.slice(0, 10); // YYYY-MM-DD
};

// ═══════════════════════════════════════════════════════════════
// Row → DTO mapper
// ═══════════════════════════════════════════════════════════════

const mapStudentProfile = (r: StudentProfileRow): StudentProfileDto => ({
  id: Number(r.stu_id),
  userId: Number(r.stu_user_id),
  enrollmentNumber: r.stu_enrollment_number,
  enrollmentDate: toIsoDate(r.stu_enrollment_date) ?? '',
  enrollmentType: r.stu_enrollment_type,
  // Education
  educationLevelId: toNum(r.stu_education_level_id),
  educationLevelName: r.education_level_name,
  educationLevelAbbreviation: r.education_level_abbreviation,
  educationLevelCategory: r.education_level_category,
  currentInstitution: r.stu_current_institution,
  currentFieldOfStudy: r.stu_current_field_of_study,
  currentSemesterOrYear: r.stu_current_semester_or_year,
  expectedGraduationDate: toIsoDate(r.stu_expected_graduation_date),
  isCurrentlyStudying: r.stu_is_currently_studying,
  // Learning preferences
  learningGoalId: toNum(r.stu_learning_goal_id),
  learningGoalName: r.learning_goal_name,
  specializationId: toNum(r.stu_specialization_id),
  specializationName: r.specialization_name,
  specializationCategory: r.specialization_category,
  preferredLearningMode: r.stu_preferred_learning_mode,
  preferredLearningLanguageId: toNum(r.stu_preferred_learning_language_id),
  preferredLearningLanguageName: r.preferred_learning_language_name,
  preferredLearningLanguageNativeName: r.preferred_learning_language_native_name,
  preferredContentType: r.stu_preferred_content_type,
  dailyLearningHours: toNum(r.stu_daily_learning_hours),
  weeklyAvailableDays: r.stu_weekly_available_days,
  difficultyPreference: r.stu_difficulty_preference,
  // Parent / guardian
  parentGuardianName: r.stu_parent_guardian_name,
  parentGuardianPhone: r.stu_parent_guardian_phone,
  parentGuardianEmail: r.stu_parent_guardian_email,
  parentGuardianRelation: r.stu_parent_guardian_relation,
  // Academic performance
  coursesEnrolled: Number(r.stu_courses_enrolled),
  coursesCompleted: Number(r.stu_courses_completed),
  coursesInProgress: Number(r.stu_courses_in_progress),
  certificatesEarned: Number(r.stu_certificates_earned),
  totalLearningHours: Number(r.stu_total_learning_hours),
  averageScore: toNum(r.stu_average_score),
  currentStreakDays: Number(r.stu_current_streak_days),
  longestStreakDays: Number(r.stu_longest_streak_days),
  xpPoints: Number(r.stu_xp_points),
  level: Number(r.stu_level),
  // Financial
  subscriptionPlan: r.stu_subscription_plan,
  subscriptionStartDate: toIsoDate(r.stu_subscription_start_date),
  subscriptionEndDate: toIsoDate(r.stu_subscription_end_date),
  totalAmountPaid: Number(r.stu_total_amount_paid),
  hasActiveSubscription: r.stu_has_active_subscription,
  referredByUserId: toNum(r.stu_referred_by_user_id),
  referrerFirstName: r.referrer_first_name,
  referrerLastName: r.referrer_last_name,
  referrerEmail: r.referrer_email,
  referralCode: r.stu_referral_code,
  // Placement / career
  isSeekingJob: r.stu_is_seeking_job,
  preferredJobRoles: r.stu_preferred_job_roles,
  preferredLocations: r.stu_preferred_locations,
  expectedSalaryRange: r.stu_expected_salary_range,
  resumeUrl: r.stu_resume_url,
  portfolioUrl: r.stu_portfolio_url,
  isOpenToInternship: r.stu_is_open_to_internship,
  isOpenToFreelance: r.stu_is_open_to_freelance,
  // Audit
  createdBy: toNum(r.stu_created_by),
  updatedBy: toNum(r.stu_updated_by),
  isActive: r.stu_is_active,
  isDeleted: r.stu_is_deleted,
  createdAt: toIso(r.stu_created_at) ?? '',
  updatedAt: toIso(r.stu_updated_at) ?? '',
  deletedAt: toIso(r.stu_deleted_at),
  // Parent user
  user: {
    firstName: r.user_first_name,
    lastName: r.user_last_name,
    email: r.user_email,
    mobile: r.user_mobile,
    roleId: Number(r.user_role_id),
    roleName: r.role_name,
    isActive: r.user_is_active,
    isDeleted: r.user_is_deleted,
    isEmailVerified: r.user_is_email_verified,
    isMobileVerified: r.user_is_mobile_verified,
  },
});

// ═══════════════════════════════════════════════════════════════
// Service functions
// ═══════════════════════════════════════════════════════════════

export interface ListStudentProfilesResult {
  rows: StudentProfileDto[];
  meta: PaginationMeta;
}

export const listStudentProfiles = async (
  q: ListStudentProfilesQuery,
): Promise<ListStudentProfilesResult> => {
  const { rows, totalCount } = await db.callTableFunction<StudentProfileRow>(
    'udf_get_student_profiles',
    {
      p_sort_table: q.sortTable ?? undefined,
      p_sort_column: q.sortColumn ?? undefined,
      p_sort_direction: q.sortDirection ?? undefined,
      p_filter_enrollment_type: q.filterEnrollmentType ?? undefined,
      p_filter_preferred_learning_mode: q.filterPreferredLearningMode ?? undefined,
      p_filter_preferred_content_type: q.filterPreferredContentType ?? undefined,
      p_filter_difficulty_preference: q.filterDifficultyPreference ?? undefined,
      p_filter_subscription_plan: q.filterSubscriptionPlan ?? undefined,
      p_filter_has_active_subscription: q.filterHasActiveSubscription ?? undefined,
      p_filter_is_currently_studying: q.filterIsCurrentlyStudying ?? undefined,
      p_filter_is_seeking_job: q.filterIsSeekingJob ?? undefined,
      p_filter_is_open_to_internship: q.filterIsOpenToInternship ?? undefined,
      p_filter_is_open_to_freelance: q.filterIsOpenToFreelance ?? undefined,
      p_filter_is_active: q.filterIsActive ?? undefined,
      p_filter_is_deleted: q.filterIsDeleted ?? undefined,
      p_filter_education_level_id: q.filterEducationLevelId ?? undefined,
      p_filter_learning_goal_id: q.filterLearningGoalId ?? undefined,
      p_filter_specialization_id: q.filterSpecializationId ?? undefined,
      p_filter_preferred_learning_language_id: q.filterPreferredLearningLanguageId ?? undefined,
      p_filter_user_role: q.filterUserRole ?? undefined,
      p_filter_user_is_active: q.filterUserIsActive ?? undefined,
      p_search_term: q.searchTerm ?? undefined,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize,
    },
  );

  return {
    rows: rows.map(mapStudentProfile),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount),
  };
};

export const getStudentProfileById = async (
  id: number,
): Promise<StudentProfileDto | null> => {
  const { rows } = await db.callTableFunction<StudentProfileRow>(
    'udf_get_student_profiles',
    { p_id: id },
  );
  return rows[0] ? mapStudentProfile(rows[0]) : null;
};

export const getStudentProfileByUserId = async (
  userId: number,
): Promise<StudentProfileDto | null> => {
  const { rows } = await db.callTableFunction<StudentProfileRow>(
    'udf_get_student_profiles',
    { p_user_id: userId },
  );
  return rows[0] ? mapStudentProfile(rows[0]) : null;
};

// ── Param builders ──────────────────────────────────────────

const buildInsertParams = (
  body: CreateStudentProfileBody,
  callerId: number | null,
): Record<string, unknown> => ({
  p_user_id: body.userId,
  p_enrollment_number: body.enrollmentNumber,
  p_enrollment_date: body.enrollmentDate ?? null,
  p_enrollment_type: body.enrollmentType ?? null,
  p_education_level_id: body.educationLevelId ?? null,
  p_current_institution: body.currentInstitution ?? null,
  p_current_field_of_study: body.currentFieldOfStudy ?? null,
  p_current_semester_or_year: body.currentSemesterOrYear ?? null,
  p_expected_graduation_date: body.expectedGraduationDate ?? null,
  p_is_currently_studying: body.isCurrentlyStudying ?? null,
  p_learning_goal_id: body.learningGoalId ?? null,
  p_specialization_id: body.specializationId ?? null,
  p_preferred_learning_mode: body.preferredLearningMode ?? null,
  p_preferred_learning_language_id: body.preferredLearningLanguageId ?? null,
  p_preferred_content_type: body.preferredContentType ?? null,
  p_daily_learning_hours: body.dailyLearningHours ?? null,
  p_weekly_available_days: body.weeklyAvailableDays ?? null,
  p_difficulty_preference: body.difficultyPreference ?? null,
  p_parent_guardian_name: body.parentGuardianName ?? null,
  p_parent_guardian_phone: body.parentGuardianPhone ?? null,
  p_parent_guardian_email: body.parentGuardianEmail ?? null,
  p_parent_guardian_relation: body.parentGuardianRelation ?? null,
  p_subscription_plan: body.subscriptionPlan ?? null,
  p_referred_by_user_id: body.referredByUserId ?? null,
  p_referral_code: body.referralCode ?? null,
  p_is_seeking_job: body.isSeekingJob ?? null,
  p_preferred_job_roles: body.preferredJobRoles ?? null,
  p_preferred_locations: body.preferredLocations ?? null,
  p_expected_salary_range: body.expectedSalaryRange ?? null,
  p_resume_url: body.resumeUrl ?? null,
  p_portfolio_url: body.portfolioUrl ?? null,
  p_is_open_to_internship: body.isOpenToInternship ?? null,
  p_is_open_to_freelance: body.isOpenToFreelance ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId,
});

const buildUpdateParams = (
  id: number,
  body: UpdateStudentProfileBody,
  callerId: number | null,
): Record<string, unknown> => ({
  p_id: id,
  p_enrollment_number: body.enrollmentNumber ?? null,
  p_enrollment_date: body.enrollmentDate ?? null,
  p_enrollment_type: body.enrollmentType ?? null,
  p_education_level_id: body.educationLevelId ?? null,
  p_current_institution: body.currentInstitution ?? null,
  p_current_field_of_study: body.currentFieldOfStudy ?? null,
  p_current_semester_or_year: body.currentSemesterOrYear ?? null,
  p_expected_graduation_date: body.expectedGraduationDate ?? null,
  p_is_currently_studying: body.isCurrentlyStudying ?? null,
  p_learning_goal_id: body.learningGoalId ?? null,
  p_specialization_id: body.specializationId ?? null,
  p_preferred_learning_mode: body.preferredLearningMode ?? null,
  p_preferred_learning_language_id: body.preferredLearningLanguageId ?? null,
  p_preferred_content_type: body.preferredContentType ?? null,
  p_daily_learning_hours: body.dailyLearningHours ?? null,
  p_weekly_available_days: body.weeklyAvailableDays ?? null,
  p_difficulty_preference: body.difficultyPreference ?? null,
  p_parent_guardian_name: body.parentGuardianName ?? null,
  p_parent_guardian_phone: body.parentGuardianPhone ?? null,
  p_parent_guardian_email: body.parentGuardianEmail ?? null,
  p_parent_guardian_relation: body.parentGuardianRelation ?? null,
  p_courses_enrolled: body.coursesEnrolled ?? null,
  p_courses_completed: body.coursesCompleted ?? null,
  p_courses_in_progress: body.coursesInProgress ?? null,
  p_certificates_earned: body.certificatesEarned ?? null,
  p_total_learning_hours: body.totalLearningHours ?? null,
  p_average_score: body.averageScore ?? null,
  p_current_streak_days: body.currentStreakDays ?? null,
  p_longest_streak_days: body.longestStreakDays ?? null,
  p_xp_points: body.xpPoints ?? null,
  p_level: body.level ?? null,
  p_subscription_plan: body.subscriptionPlan ?? null,
  p_subscription_start_date: body.subscriptionStartDate ?? null,
  p_subscription_end_date: body.subscriptionEndDate ?? null,
  p_total_amount_paid: body.totalAmountPaid ?? null,
  p_has_active_subscription: body.hasActiveSubscription ?? null,
  p_referred_by_user_id: body.referredByUserId ?? null,
  p_referral_code: body.referralCode ?? null,
  p_is_seeking_job: body.isSeekingJob ?? null,
  p_preferred_job_roles: body.preferredJobRoles ?? null,
  p_preferred_locations: body.preferredLocations ?? null,
  p_expected_salary_range: body.expectedSalaryRange ?? null,
  p_resume_url: body.resumeUrl ?? null,
  p_portfolio_url: body.portfolioUrl ?? null,
  p_is_open_to_internship: body.isOpenToInternship ?? null,
  p_is_open_to_freelance: body.isOpenToFreelance ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId,
});

// ── Mutations ───────────────────────────────────────────────

export interface CreateStudentProfileResult {
  id: number;
}

export const createStudentProfile = async (
  body: CreateStudentProfileBody,
  callerId: number | null,
): Promise<CreateStudentProfileResult> => {
  const result = await db.callFunction(
    'udf_insert_student_profiles',
    buildInsertParams(body, callerId),
  );
  return { id: Number(result.id) };
};

export const updateStudentProfile = async (
  id: number,
  body: UpdateStudentProfileBody,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction(
    'udf_update_student_profiles',
    buildUpdateParams(id, body, callerId),
  );
};

export const deleteStudentProfile = async (
  id: number,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction('udf_delete_student_profiles', {
    p_id: id,
    p_actor_id: callerId,
  });
};
