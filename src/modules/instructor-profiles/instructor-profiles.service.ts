import { db } from '../../database/db';
import { buildPaginationMeta } from '../../core/utils/api-response';
import type { PaginationMeta } from '../../core/types/common.types';
import type {
  ListInstructorProfilesQuery,
  CreateInstructorProfileBody,
  UpdateInstructorProfileBody,
} from './instructor-profiles.schemas';

// ═══════════════════════════════════════════════════════════════
// Internal row type — mirrors udf_get_instructor_profiles output
// ═══════════════════════════════════════════════════════════════

interface InstructorProfileRow {
  inst_id: number | string;
  inst_user_id: number | string;
  inst_instructor_code: string;
  inst_instructor_type: string;
  inst_designation_id: number | string | null;
  inst_department_id: number | string | null;
  inst_branch_id: number | string | null;
  inst_joining_date: Date | string | null;
  inst_specialization_id: number | string | null;
  inst_secondary_specialization_id: number | string | null;
  inst_teaching_experience_years: number | string | null;
  inst_industry_experience_years: number | string | null;
  inst_total_experience_years: number | string | null;
  inst_preferred_teaching_language_id: number | string | null;
  inst_teaching_mode: string;
  inst_instructor_bio: string | null;
  inst_tagline: string | null;
  inst_demo_video_url: string | null;
  inst_intro_video_duration_sec: number | null;
  inst_highest_qualification: string | null;
  inst_certifications_summary: string | null;
  inst_awards_and_recognition: string | null;
  inst_publications_count: number;
  inst_patents_count: number;
  inst_total_courses_created: number;
  inst_total_courses_published: number;
  inst_total_students_taught: number;
  inst_total_reviews_received: number;
  inst_average_rating: number | string;
  inst_total_teaching_hours: number | string;
  inst_total_content_minutes: number;
  inst_completion_rate: number | string | null;
  inst_is_available: boolean;
  inst_available_hours_per_week: number | string | null;
  inst_available_from: Date | string | null;
  inst_available_until: Date | string | null;
  inst_preferred_time_slots: string | null;
  inst_max_concurrent_courses: number | null;
  inst_payment_model: string | null;
  inst_revenue_share_percentage: number | string | null;
  inst_fixed_rate_per_course: number | string | null;
  inst_hourly_rate: number | string | null;
  inst_payment_currency: string | null;
  inst_approval_status: string;
  inst_approved_by: number | string | null;
  inst_approved_at: Date | string | null;
  inst_rejection_reason: string | null;
  inst_is_verified: boolean;
  inst_is_featured: boolean;
  inst_badge: string | null;
  inst_created_by: number | string | null;
  inst_updated_by: number | string | null;
  inst_is_active: boolean;
  inst_is_deleted: boolean;
  inst_created_at: Date | string;
  inst_updated_at: Date | string;
  inst_deleted_at: Date | string | null;
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
  // Specialization
  specialization_name: string | null;
  specialization_category: string | null;
  // Secondary specialization
  secondary_specialization_name: string | null;
  secondary_specialization_category: string | null;
  // Designation
  designation_name: string | null;
  designation_code: string | null;
  designation_level_band: string | null;
  // Department
  department_name: string | null;
  department_code: string | null;
  // Branch
  branch_name: string | null;
  branch_code: string | null;
  // Language
  preferred_teaching_language_name: string | null;
  // Approver
  approver_first_name: string | null;
  approver_last_name: string | null;
  // Pagination
  total_count: number | string;
}

// ═══════════════════════════════════════════════════════════════
// Public DTO
// ═══════════════════════════════════════════════════════════════

export interface InstructorProfileDto {
  id: number;
  userId: number;
  instructorCode: string;
  instructorType: string;
  // Organization
  designationId: number | null;
  designationName: string | null;
  designationCode: string | null;
  designationLevelBand: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  branchId: number | null;
  branchName: string | null;
  branchCode: string | null;
  joiningDate: string | null;
  // Teaching
  specializationId: number | null;
  specializationName: string | null;
  specializationCategory: string | null;
  secondarySpecializationId: number | null;
  secondarySpecializationName: string | null;
  secondarySpecializationCategory: string | null;
  teachingExperienceYears: number | null;
  industryExperienceYears: number | null;
  totalExperienceYears: number | null;
  preferredTeachingLanguageId: number | null;
  preferredTeachingLanguageName: string | null;
  teachingMode: string;
  // Bio
  instructorBio: string | null;
  tagline: string | null;
  demoVideoUrl: string | null;
  introVideoDurationSec: number | null;
  // Qualifications
  highestQualification: string | null;
  certificationsSummary: string | null;
  awardsAndRecognition: string | null;
  publicationsCount: number;
  patentsCount: number;
  // Performance
  totalCoursesCreated: number;
  totalCoursesPublished: number;
  totalStudentsTaught: number;
  totalReviewsReceived: number;
  averageRating: number;
  totalTeachingHours: number;
  totalContentMinutes: number;
  completionRate: number | null;
  // Availability
  isAvailable: boolean;
  availableHoursPerWeek: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  preferredTimeSlots: string | null;
  maxConcurrentCourses: number | null;
  // Compensation
  paymentModel: string | null;
  revenueSharePercentage: number | null;
  fixedRatePerCourse: number | null;
  hourlyRate: number | null;
  paymentCurrency: string | null;
  // Approval
  approvalStatus: string;
  approvedBy: number | null;
  approverFirstName: string | null;
  approverLastName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  isVerified: boolean;
  isFeatured: boolean;
  badge: string | null;
  // Audit
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Parent user
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
  return s.slice(0, 10);
};

// ═══════════════════════════════════════════════════════════════
// Row → DTO mapper
// ═══════════════════════════════════════════════════════════════

const mapInstructorProfile = (r: InstructorProfileRow): InstructorProfileDto => ({
  id: Number(r.inst_id),
  userId: Number(r.inst_user_id),
  instructorCode: r.inst_instructor_code,
  instructorType: r.inst_instructor_type,
  // Organization
  designationId: toNum(r.inst_designation_id),
  designationName: r.designation_name,
  designationCode: r.designation_code,
  designationLevelBand: r.designation_level_band,
  departmentId: toNum(r.inst_department_id),
  departmentName: r.department_name,
  departmentCode: r.department_code,
  branchId: toNum(r.inst_branch_id),
  branchName: r.branch_name,
  branchCode: r.branch_code,
  joiningDate: toIsoDate(r.inst_joining_date),
  // Teaching
  specializationId: toNum(r.inst_specialization_id),
  specializationName: r.specialization_name,
  specializationCategory: r.specialization_category,
  secondarySpecializationId: toNum(r.inst_secondary_specialization_id),
  secondarySpecializationName: r.secondary_specialization_name,
  secondarySpecializationCategory: r.secondary_specialization_category,
  teachingExperienceYears: toNum(r.inst_teaching_experience_years),
  industryExperienceYears: toNum(r.inst_industry_experience_years),
  totalExperienceYears: toNum(r.inst_total_experience_years),
  preferredTeachingLanguageId: toNum(r.inst_preferred_teaching_language_id),
  preferredTeachingLanguageName: r.preferred_teaching_language_name,
  teachingMode: r.inst_teaching_mode,
  // Bio
  instructorBio: r.inst_instructor_bio,
  tagline: r.inst_tagline,
  demoVideoUrl: r.inst_demo_video_url,
  introVideoDurationSec: r.inst_intro_video_duration_sec,
  // Qualifications
  highestQualification: r.inst_highest_qualification,
  certificationsSummary: r.inst_certifications_summary,
  awardsAndRecognition: r.inst_awards_and_recognition,
  publicationsCount: Number(r.inst_publications_count),
  patentsCount: Number(r.inst_patents_count),
  // Performance
  totalCoursesCreated: Number(r.inst_total_courses_created),
  totalCoursesPublished: Number(r.inst_total_courses_published),
  totalStudentsTaught: Number(r.inst_total_students_taught),
  totalReviewsReceived: Number(r.inst_total_reviews_received),
  averageRating: Number(r.inst_average_rating),
  totalTeachingHours: Number(r.inst_total_teaching_hours),
  totalContentMinutes: Number(r.inst_total_content_minutes),
  completionRate: toNum(r.inst_completion_rate),
  // Availability
  isAvailable: r.inst_is_available,
  availableHoursPerWeek: toNum(r.inst_available_hours_per_week),
  availableFrom: toIsoDate(r.inst_available_from),
  availableUntil: toIsoDate(r.inst_available_until),
  preferredTimeSlots: r.inst_preferred_time_slots,
  maxConcurrentCourses: r.inst_max_concurrent_courses,
  // Compensation
  paymentModel: r.inst_payment_model,
  revenueSharePercentage: toNum(r.inst_revenue_share_percentage),
  fixedRatePerCourse: toNum(r.inst_fixed_rate_per_course),
  hourlyRate: toNum(r.inst_hourly_rate),
  paymentCurrency: r.inst_payment_currency,
  // Approval
  approvalStatus: r.inst_approval_status,
  approvedBy: toNum(r.inst_approved_by),
  approverFirstName: r.approver_first_name,
  approverLastName: r.approver_last_name,
  approvedAt: toIso(r.inst_approved_at),
  rejectionReason: r.inst_rejection_reason,
  isVerified: r.inst_is_verified,
  isFeatured: r.inst_is_featured,
  badge: r.inst_badge,
  // Audit
  createdBy: toNum(r.inst_created_by),
  updatedBy: toNum(r.inst_updated_by),
  isActive: r.inst_is_active,
  isDeleted: r.inst_is_deleted,
  createdAt: toIso(r.inst_created_at) ?? '',
  updatedAt: toIso(r.inst_updated_at) ?? '',
  deletedAt: toIso(r.inst_deleted_at),
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

export interface ListInstructorProfilesResult {
  rows: InstructorProfileDto[];
  meta: PaginationMeta;
}

export const listInstructorProfiles = async (
  q: ListInstructorProfilesQuery,
): Promise<ListInstructorProfilesResult> => {
  const { rows, totalCount } = await db.callTableFunction<InstructorProfileRow>(
    'udf_get_instructor_profiles',
    {
      p_sort_table: q.sortTable ?? undefined,
      p_sort_column: q.sortColumn ?? undefined,
      p_sort_direction: q.sortDirection ?? undefined,
      p_filter_instructor_type: q.filterInstructorType ?? undefined,
      p_filter_teaching_mode: q.filterTeachingMode ?? undefined,
      p_filter_approval_status: q.filterApprovalStatus ?? undefined,
      p_filter_payment_model: q.filterPaymentModel ?? undefined,
      p_filter_badge: q.filterBadge ?? undefined,
      p_filter_is_available: q.filterIsAvailable ?? undefined,
      p_filter_is_verified: q.filterIsVerified ?? undefined,
      p_filter_is_featured: q.filterIsFeatured ?? undefined,
      p_filter_is_active: q.filterIsActive ?? undefined,
      p_filter_is_deleted: q.filterIsDeleted ?? undefined,
      p_filter_specialization_id: q.filterSpecializationId ?? undefined,
      p_filter_secondary_specialization_id: q.filterSecondarySpecializationId ?? undefined,
      p_filter_designation_id: q.filterDesignationId ?? undefined,
      p_filter_department_id: q.filterDepartmentId ?? undefined,
      p_filter_branch_id: q.filterBranchId ?? undefined,
      p_filter_user_role: q.filterUserRole ?? undefined,
      p_filter_user_is_active: q.filterUserIsActive ?? undefined,
      p_search_term: q.searchTerm ?? undefined,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize,
    },
  );

  return {
    rows: rows.map(mapInstructorProfile),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount),
  };
};

export const getInstructorProfileById = async (
  id: number,
): Promise<InstructorProfileDto | null> => {
  const { rows } = await db.callTableFunction<InstructorProfileRow>(
    'udf_get_instructor_profiles',
    { p_id: id },
  );
  return rows[0] ? mapInstructorProfile(rows[0]) : null;
};

export const getInstructorProfileByUserId = async (
  userId: number,
): Promise<InstructorProfileDto | null> => {
  const { rows } = await db.callTableFunction<InstructorProfileRow>(
    'udf_get_instructor_profiles',
    { p_user_id: userId },
  );
  return rows[0] ? mapInstructorProfile(rows[0]) : null;
};

// ── Param builders ──────────────────────────────────────────

const buildInsertParams = (
  body: CreateInstructorProfileBody,
  callerId: number | null,
): Record<string, unknown> => ({
  p_user_id: body.userId,
  p_instructor_code: body.instructorCode,
  p_instructor_type: body.instructorType ?? null,
  p_designation_id: body.designationId ?? null,
  p_department_id: body.departmentId ?? null,
  p_branch_id: body.branchId ?? null,
  p_joining_date: body.joiningDate ?? null,
  p_specialization_id: body.specializationId ?? null,
  p_secondary_specialization_id: body.secondarySpecializationId ?? null,
  p_teaching_experience_years: body.teachingExperienceYears ?? null,
  p_industry_experience_years: body.industryExperienceYears ?? null,
  p_total_experience_years: body.totalExperienceYears ?? null,
  p_preferred_teaching_language_id: body.preferredTeachingLanguageId ?? null,
  p_teaching_mode: body.teachingMode ?? null,
  p_instructor_bio: body.instructorBio ?? null,
  p_tagline: body.tagline ?? null,
  p_demo_video_url: body.demoVideoUrl ?? null,
  p_intro_video_duration_sec: body.introVideoDurationSec ?? null,
  p_highest_qualification: body.highestQualification ?? null,
  p_certifications_summary: body.certificationsSummary ?? null,
  p_awards_and_recognition: body.awardsAndRecognition ?? null,
  p_is_available: body.isAvailable ?? null,
  p_available_hours_per_week: body.availableHoursPerWeek ?? null,
  p_available_from: body.availableFrom ?? null,
  p_available_until: body.availableUntil ?? null,
  p_preferred_time_slots: body.preferredTimeSlots ?? null,
  p_max_concurrent_courses: body.maxConcurrentCourses ?? null,
  p_payment_model: body.paymentModel ?? null,
  p_revenue_share_percentage: body.revenueSharePercentage ?? null,
  p_fixed_rate_per_course: body.fixedRatePerCourse ?? null,
  p_hourly_rate: body.hourlyRate ?? null,
  p_payment_currency: body.paymentCurrency ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId,
});

const buildUpdateParams = (
  id: number,
  body: UpdateInstructorProfileBody,
  callerId: number | null,
): Record<string, unknown> => ({
  p_id: id,
  p_instructor_code: body.instructorCode ?? null,
  p_instructor_type: body.instructorType ?? null,
  p_designation_id: body.designationId ?? null,
  p_department_id: body.departmentId ?? null,
  p_branch_id: body.branchId ?? null,
  p_joining_date: body.joiningDate ?? null,
  p_specialization_id: body.specializationId ?? null,
  p_secondary_specialization_id: body.secondarySpecializationId ?? null,
  p_teaching_experience_years: body.teachingExperienceYears ?? null,
  p_industry_experience_years: body.industryExperienceYears ?? null,
  p_total_experience_years: body.totalExperienceYears ?? null,
  p_preferred_teaching_language_id: body.preferredTeachingLanguageId ?? null,
  p_teaching_mode: body.teachingMode ?? null,
  p_instructor_bio: body.instructorBio ?? null,
  p_tagline: body.tagline ?? null,
  p_demo_video_url: body.demoVideoUrl ?? null,
  p_intro_video_duration_sec: body.introVideoDurationSec ?? null,
  p_highest_qualification: body.highestQualification ?? null,
  p_certifications_summary: body.certificationsSummary ?? null,
  p_awards_and_recognition: body.awardsAndRecognition ?? null,
  p_publications_count: body.publicationsCount ?? null,
  p_patents_count: body.patentsCount ?? null,
  p_total_courses_created: body.totalCoursesCreated ?? null,
  p_total_courses_published: body.totalCoursesPublished ?? null,
  p_total_students_taught: body.totalStudentsTaught ?? null,
  p_total_reviews_received: body.totalReviewsReceived ?? null,
  p_average_rating: body.averageRating ?? null,
  p_total_teaching_hours: body.totalTeachingHours ?? null,
  p_total_content_minutes: body.totalContentMinutes ?? null,
  p_completion_rate: body.completionRate ?? null,
  p_is_available: body.isAvailable ?? null,
  p_available_hours_per_week: body.availableHoursPerWeek ?? null,
  p_available_from: body.availableFrom ?? null,
  p_available_until: body.availableUntil ?? null,
  p_preferred_time_slots: body.preferredTimeSlots ?? null,
  p_max_concurrent_courses: body.maxConcurrentCourses ?? null,
  p_payment_model: body.paymentModel ?? null,
  p_revenue_share_percentage: body.revenueSharePercentage ?? null,
  p_fixed_rate_per_course: body.fixedRatePerCourse ?? null,
  p_hourly_rate: body.hourlyRate ?? null,
  p_payment_currency: body.paymentCurrency ?? null,
  p_approval_status: body.approvalStatus ?? null,
  p_approved_by: body.approvedBy ?? null,
  p_approved_at: body.approvedAt ?? null,
  p_rejection_reason: body.rejectionReason ?? null,
  p_is_verified: body.isVerified ?? null,
  p_is_featured: body.isFeatured ?? null,
  p_badge: body.badge ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId,
});

// ── Mutations ───────────────────────────────────────────────

export interface CreateInstructorProfileResult {
  id: number;
}

export const createInstructorProfile = async (
  body: CreateInstructorProfileBody,
  callerId: number | null,
): Promise<CreateInstructorProfileResult> => {
  const result = await db.callFunction(
    'udf_insert_instructor_profiles',
    buildInsertParams(body, callerId),
  );
  return { id: Number(result.id) };
};

export const updateInstructorProfile = async (
  id: number,
  body: UpdateInstructorProfileBody,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction(
    'udf_update_instructor_profiles',
    buildUpdateParams(id, body, callerId),
  );
};

export const deleteInstructorProfile = async (
  id: number,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction('udf_delete_instructor_profiles', {
    p_id: id,
    p_actor_id: callerId,
  });
};

export const restoreInstructorProfile = async (
  id: number,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction('udf_restore_instructor_profiles', {
    p_id: id,
    p_actor_id: callerId,
  });
};
