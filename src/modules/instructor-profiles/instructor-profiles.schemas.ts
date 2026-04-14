import { z } from 'zod';
import {
  bigintIdSchema,
  paginationSchema,
  searchTermSchema,
  sortDirectionSchema,
  queryBooleanSchema,
} from '../../shared/validation/common';

// ═══════════════════════════════════════════════════════════════
// Atoms — CHECK-constraint-aligned enums
// ═══════════════════════════════════════════════════════════════

export const INSTRUCTOR_TYPE = [
  'internal', 'external', 'guest', 'visiting', 'corporate', 'community', 'other',
] as const;

export const TEACHING_MODE = [
  'online', 'offline', 'hybrid', 'recorded_only',
] as const;

export const PAYMENT_MODEL = [
  'revenue_share', 'fixed_per_course', 'hourly', 'monthly_salary',
  'per_student', 'hybrid', 'volunteer', 'other',
] as const;

export const APPROVAL_STATUS = [
  'pending', 'under_review', 'approved', 'rejected', 'suspended', 'blacklisted',
] as const;

export const BADGE = [
  'new', 'rising', 'popular', 'top_rated', 'expert', 'elite',
] as const;

// ── Sort whitelist ──────────────────────────────────────────

export const INSTRUCTOR_PROFILE_SORT_TABLES = [
  'inst', 'specialization', 'designation', 'department', 'user',
] as const;

export const INSTRUCTOR_PROFILE_SORT_COLUMNS_INST = [
  'id', 'instructor_code', 'instructor_type', 'teaching_mode',
  'teaching_experience_years', 'industry_experience_years', 'total_experience_years',
  'average_rating', 'total_students_taught', 'total_courses_published',
  'total_teaching_hours', 'completion_rate', 'approval_status', 'badge',
  'is_active', 'created_at', 'updated_at',
] as const;

export const INSTRUCTOR_PROFILE_SORT_COLUMNS_SPECIALIZATION = [
  'name', 'category',
] as const;

export const INSTRUCTOR_PROFILE_SORT_COLUMNS_DESIGNATION = [
  'name', 'level', 'level_band',
] as const;

export const INSTRUCTOR_PROFILE_SORT_COLUMNS_DEPARTMENT = [
  'name', 'code',
] as const;

export const INSTRUCTOR_PROFILE_SORT_COLUMNS_USER = [
  'first_name', 'last_name', 'email', 'role',
] as const;

// ═══════════════════════════════════════════════════════════════
// List query schema
// ═══════════════════════════════════════════════════════════════

export const listInstructorProfilesQuerySchema = paginationSchema.extend({
  // Sort
  sortTable: z.enum(INSTRUCTOR_PROFILE_SORT_TABLES).default('inst').optional(),
  sortColumn: z.string().default('id').optional(),
  sortDirection: sortDirectionSchema.optional(),

  // Filters — instructor
  filterInstructorType: z.enum(INSTRUCTOR_TYPE).optional(),
  filterTeachingMode: z.enum(TEACHING_MODE).optional(),
  filterApprovalStatus: z.enum(APPROVAL_STATUS).optional(),
  filterPaymentModel: z.enum(PAYMENT_MODEL).optional(),
  filterBadge: z.enum(BADGE).optional(),
  filterIsAvailable: queryBooleanSchema.optional(),
  filterIsVerified: queryBooleanSchema.optional(),
  filterIsFeatured: queryBooleanSchema.optional(),
  filterIsActive: queryBooleanSchema.optional(),
  filterIsDeleted: queryBooleanSchema.optional(),

  // Filters — FK
  filterSpecializationId: bigintIdSchema.optional(),
  filterSecondarySpecializationId: bigintIdSchema.optional(),
  filterDesignationId: bigintIdSchema.optional(),
  filterDepartmentId: bigintIdSchema.optional(),
  filterBranchId: bigintIdSchema.optional(),

  // Filters — user
  filterUserRole: z.string().trim().optional(),
  filterUserIsActive: queryBooleanSchema.optional(),

  // Search
  searchTerm: searchTermSchema.optional(),
});

export type ListInstructorProfilesQuery = z.infer<typeof listInstructorProfilesQuerySchema>;

// ═══════════════════════════════════════════════════════════════
// Create body schema
// ═══════════════════════════════════════════════════════════════

export const createInstructorProfileBodySchema = z.object({
  userId: bigintIdSchema,
  instructorCode: z.string().trim().min(1).max(50),

  // Optionals with defaults in UDF
  instructorType: z.enum(INSTRUCTOR_TYPE).optional(),
  designationId: bigintIdSchema.optional().nullable(),
  departmentId: bigintIdSchema.optional().nullable(),
  branchId: bigintIdSchema.optional().nullable(),
  joiningDate: z.string().trim().optional().nullable(),
  specializationId: bigintIdSchema.optional().nullable(),
  secondarySpecializationId: bigintIdSchema.optional().nullable(),
  teachingExperienceYears: z.number().nonnegative().optional().nullable(),
  industryExperienceYears: z.number().nonnegative().optional().nullable(),
  totalExperienceYears: z.number().nonnegative().optional().nullable(),
  preferredTeachingLanguageId: bigintIdSchema.optional().nullable(),
  teachingMode: z.enum(TEACHING_MODE).optional(),
  instructorBio: z.string().trim().optional().nullable(),
  tagline: z.string().trim().max(500).optional().nullable(),
  demoVideoUrl: z.string().trim().url().optional().nullable(),
  introVideoDurationSec: z.number().int().nonnegative().optional().nullable(),
  highestQualification: z.string().trim().max(500).optional().nullable(),
  certificationsSummary: z.string().trim().optional().nullable(),
  awardsAndRecognition: z.string().trim().optional().nullable(),
  isAvailable: z.boolean().optional(),
  availableHoursPerWeek: z.number().nonnegative().optional().nullable(),
  availableFrom: z.string().trim().optional().nullable(),
  availableUntil: z.string().trim().optional().nullable(),
  preferredTimeSlots: z.string().trim().optional().nullable(),
  maxConcurrentCourses: z.number().int().nonnegative().optional().nullable(),
  paymentModel: z.enum(PAYMENT_MODEL).optional(),
  revenueSharePercentage: z.number().nonnegative().optional().nullable(),
  fixedRatePerCourse: z.number().nonnegative().optional().nullable(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  paymentCurrency: z.string().trim().max(10).optional().nullable(),
  isActive: z.boolean().optional(),
});

export type CreateInstructorProfileBody = z.infer<typeof createInstructorProfileBodySchema>;

// ═══════════════════════════════════════════════════════════════
// Update body schema  (all fields optional, at least one required)
// ═══════════════════════════════════════════════════════════════

export const updateInstructorProfileBodySchema = z.object({
  instructorCode: z.string().trim().min(1).max(50).optional(),
  instructorType: z.enum(INSTRUCTOR_TYPE).optional(),
  designationId: bigintIdSchema.optional().nullable(),
  departmentId: bigintIdSchema.optional().nullable(),
  branchId: bigintIdSchema.optional().nullable(),
  joiningDate: z.string().trim().optional().nullable(),
  specializationId: bigintIdSchema.optional().nullable(),
  secondarySpecializationId: bigintIdSchema.optional().nullable(),
  teachingExperienceYears: z.number().nonnegative().optional().nullable(),
  industryExperienceYears: z.number().nonnegative().optional().nullable(),
  totalExperienceYears: z.number().nonnegative().optional().nullable(),
  preferredTeachingLanguageId: bigintIdSchema.optional().nullable(),
  teachingMode: z.enum(TEACHING_MODE).optional(),
  instructorBio: z.string().trim().optional().nullable(),
  tagline: z.string().trim().max(500).optional().nullable(),
  demoVideoUrl: z.string().trim().url().optional().nullable(),
  introVideoDurationSec: z.number().int().nonnegative().optional().nullable(),
  highestQualification: z.string().trim().max(500).optional().nullable(),
  certificationsSummary: z.string().trim().optional().nullable(),
  awardsAndRecognition: z.string().trim().optional().nullable(),
  publicationsCount: z.number().int().nonnegative().optional(),
  patentsCount: z.number().int().nonnegative().optional(),
  totalCoursesCreated: z.number().int().nonnegative().optional(),
  totalCoursesPublished: z.number().int().nonnegative().optional(),
  totalStudentsTaught: z.number().int().nonnegative().optional(),
  totalReviewsReceived: z.number().int().nonnegative().optional(),
  averageRating: z.number().min(0).max(5).optional(),
  totalTeachingHours: z.number().nonnegative().optional(),
  totalContentMinutes: z.number().int().nonnegative().optional(),
  completionRate: z.number().min(0).max(100).optional().nullable(),
  isAvailable: z.boolean().optional(),
  availableHoursPerWeek: z.number().nonnegative().optional().nullable(),
  availableFrom: z.string().trim().optional().nullable(),
  availableUntil: z.string().trim().optional().nullable(),
  preferredTimeSlots: z.string().trim().optional().nullable(),
  maxConcurrentCourses: z.number().int().nonnegative().optional().nullable(),
  paymentModel: z.enum(PAYMENT_MODEL).optional(),
  revenueSharePercentage: z.number().nonnegative().optional().nullable(),
  fixedRatePerCourse: z.number().nonnegative().optional().nullable(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  paymentCurrency: z.string().trim().max(10).optional().nullable(),
  approvalStatus: z.enum(APPROVAL_STATUS).optional(),
  approvedBy: bigintIdSchema.optional().nullable(),
  approvedAt: z.string().trim().optional().nullable(),
  rejectionReason: z.string().trim().optional().nullable(),
  isVerified: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  badge: z.enum(BADGE).optional().nullable(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided for update.' }
);

export type UpdateInstructorProfileBody = z.infer<typeof updateInstructorProfileBodySchema>;
