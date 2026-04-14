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

export const ENROLLMENT_TYPE = [
  'self', 'corporate', 'scholarship', 'referral', 'trial', 'other',
] as const;

export const LEARNING_MODE = [
  'self_paced', 'instructor_led', 'hybrid', 'cohort_based', 'mentored',
] as const;

export const CONTENT_TYPE = [
  'video', 'text', 'interactive', 'audio', 'mixed',
] as const;

export const DIFFICULTY_PREFERENCE = [
  'beginner', 'intermediate', 'advanced', 'mixed',
] as const;

export const GUARDIAN_RELATION = [
  'father', 'mother', 'guardian', 'spouse', 'sibling', 'other',
] as const;

export const SUBSCRIPTION_PLAN = [
  'free', 'basic', 'standard', 'premium', 'enterprise', 'lifetime',
] as const;

// ── Sort whitelist ──────────────────────────────────────────

export const STUDENT_PROFILE_SORT_TABLES = [
  'stu', 'education_level', 'specialization', 'user',
] as const;

export const STUDENT_PROFILE_SORT_COLUMNS_STU = [
  'id', 'enrollment_number', 'enrollment_date', 'enrollment_type',
  'daily_learning_hours', 'courses_enrolled', 'courses_completed',
  'average_score', 'current_streak_days', 'xp_points', 'level',
  'total_learning_hours', 'total_amount_paid',
  'is_active', 'created_at', 'updated_at',
] as const;

export const STUDENT_PROFILE_SORT_COLUMNS_EDUCATION_LEVEL = [
  'name', 'category', 'order',
] as const;

export const STUDENT_PROFILE_SORT_COLUMNS_SPECIALIZATION = [
  'name', 'category',
] as const;

export const STUDENT_PROFILE_SORT_COLUMNS_USER = [
  'first_name', 'last_name', 'email', 'role',
] as const;

// ═══════════════════════════════════════════════════════════════
// List query schema
// ═══════════════════════════════════════════════════════════════

export const listStudentProfilesQuerySchema = paginationSchema.extend({
  // Sort
  sortTable: z.enum(STUDENT_PROFILE_SORT_TABLES).default('stu').optional(),
  sortColumn: z.string().default('id').optional(),
  sortDirection: sortDirectionSchema.optional(),

  // Filters — student
  filterEnrollmentType: z.enum(ENROLLMENT_TYPE).optional(),
  filterPreferredLearningMode: z.enum(LEARNING_MODE).optional(),
  filterPreferredContentType: z.enum(CONTENT_TYPE).optional(),
  filterDifficultyPreference: z.enum(DIFFICULTY_PREFERENCE).optional(),
  filterSubscriptionPlan: z.enum(SUBSCRIPTION_PLAN).optional(),
  filterHasActiveSubscription: queryBooleanSchema.optional(),
  filterIsCurrentlyStudying: queryBooleanSchema.optional(),
  filterIsSeekingJob: queryBooleanSchema.optional(),
  filterIsOpenToInternship: queryBooleanSchema.optional(),
  filterIsOpenToFreelance: queryBooleanSchema.optional(),
  filterIsActive: queryBooleanSchema.optional(),
  filterIsDeleted: queryBooleanSchema.optional(),

  // Filters — FK
  filterEducationLevelId: bigintIdSchema.optional(),
  filterLearningGoalId: bigintIdSchema.optional(),
  filterSpecializationId: bigintIdSchema.optional(),
  filterPreferredLearningLanguageId: bigintIdSchema.optional(),

  // Filters — user
  filterUserRole: z.string().trim().optional(),
  filterUserIsActive: queryBooleanSchema.optional(),

  // Search
  searchTerm: searchTermSchema.optional(),
});

export type ListStudentProfilesQuery = z.infer<typeof listStudentProfilesQuerySchema>;

// ═══════════════════════════════════════════════════════════════
// Create body schema
// ═══════════════════════════════════════════════════════════════

export const createStudentProfileBodySchema = z.object({
  userId: bigintIdSchema,
  enrollmentNumber: z.string().trim().min(1).max(50),

  // Optionals with defaults in UDF
  enrollmentDate: z.string().trim().optional().nullable(),
  enrollmentType: z.enum(ENROLLMENT_TYPE).optional(),
  educationLevelId: bigintIdSchema.optional().nullable(),
  currentInstitution: z.string().trim().max(255).optional().nullable(),
  currentFieldOfStudy: z.string().trim().max(255).optional().nullable(),
  currentSemesterOrYear: z.string().trim().max(50).optional().nullable(),
  expectedGraduationDate: z.string().trim().optional().nullable(),
  isCurrentlyStudying: z.boolean().optional(),
  learningGoalId: bigintIdSchema.optional().nullable(),
  specializationId: bigintIdSchema.optional().nullable(),
  preferredLearningMode: z.enum(LEARNING_MODE).optional(),
  preferredLearningLanguageId: bigintIdSchema.optional().nullable(),
  preferredContentType: z.enum(CONTENT_TYPE).optional(),
  dailyLearningHours: z.number().nonnegative().optional().nullable(),
  weeklyAvailableDays: z.number().int().min(0).max(7).optional(),
  difficultyPreference: z.enum(DIFFICULTY_PREFERENCE).optional(),
  parentGuardianName: z.string().trim().max(255).optional().nullable(),
  parentGuardianPhone: z.string().trim().max(20).optional().nullable(),
  parentGuardianEmail: z.string().email().optional().nullable(),
  parentGuardianRelation: z.enum(GUARDIAN_RELATION).optional().nullable(),
  subscriptionPlan: z.enum(SUBSCRIPTION_PLAN).optional(),
  referredByUserId: bigintIdSchema.optional().nullable(),
  referralCode: z.string().trim().max(50).optional().nullable(),
  isSeekingJob: z.boolean().optional(),
  preferredJobRoles: z.string().trim().max(500).optional().nullable(),
  preferredLocations: z.string().trim().max(500).optional().nullable(),
  expectedSalaryRange: z.string().trim().max(100).optional().nullable(),
  portfolioUrl: z.string().trim().url().optional().nullable(),
  isOpenToInternship: z.boolean().optional(),
  isOpenToFreelance: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateStudentProfileBody = z.infer<typeof createStudentProfileBodySchema>;

// ═══════════════════════════════════════════════════════════════
// Update body schema  (all fields optional, at least one required)
// ═══════════════════════════════════════════════════════════════

export const updateStudentProfileBodySchema = z.object({
  enrollmentNumber: z.string().trim().min(1).max(50).optional(),
  enrollmentDate: z.string().trim().optional().nullable(),
  enrollmentType: z.enum(ENROLLMENT_TYPE).optional(),
  educationLevelId: bigintIdSchema.optional().nullable(),
  currentInstitution: z.string().trim().max(255).optional().nullable(),
  currentFieldOfStudy: z.string().trim().max(255).optional().nullable(),
  currentSemesterOrYear: z.string().trim().max(50).optional().nullable(),
  expectedGraduationDate: z.string().trim().optional().nullable(),
  isCurrentlyStudying: z.boolean().optional(),
  learningGoalId: bigintIdSchema.optional().nullable(),
  specializationId: bigintIdSchema.optional().nullable(),
  preferredLearningMode: z.enum(LEARNING_MODE).optional(),
  preferredLearningLanguageId: bigintIdSchema.optional().nullable(),
  preferredContentType: z.enum(CONTENT_TYPE).optional(),
  dailyLearningHours: z.number().nonnegative().optional().nullable(),
  weeklyAvailableDays: z.number().int().min(0).max(7).optional(),
  difficultyPreference: z.enum(DIFFICULTY_PREFERENCE).optional(),
  parentGuardianName: z.string().trim().max(255).optional().nullable(),
  parentGuardianPhone: z.string().trim().max(20).optional().nullable(),
  parentGuardianEmail: z.string().email().optional().nullable(),
  parentGuardianRelation: z.enum(GUARDIAN_RELATION).optional().nullable(),
  coursesEnrolled: z.number().int().nonnegative().optional(),
  coursesCompleted: z.number().int().nonnegative().optional(),
  coursesInProgress: z.number().int().nonnegative().optional(),
  certificatesEarned: z.number().int().nonnegative().optional(),
  totalLearningHours: z.number().nonnegative().optional(),
  averageScore: z.number().nonnegative().optional().nullable(),
  currentStreakDays: z.number().int().nonnegative().optional(),
  longestStreakDays: z.number().int().nonnegative().optional(),
  xpPoints: z.number().int().nonnegative().optional(),
  level: z.number().int().positive().optional(),
  subscriptionPlan: z.enum(SUBSCRIPTION_PLAN).optional(),
  subscriptionStartDate: z.string().trim().optional().nullable(),
  subscriptionEndDate: z.string().trim().optional().nullable(),
  totalAmountPaid: z.number().nonnegative().optional(),
  hasActiveSubscription: z.boolean().optional(),
  referredByUserId: bigintIdSchema.optional().nullable(),
  referralCode: z.string().trim().max(50).optional().nullable(),
  isSeekingJob: z.boolean().optional(),
  preferredJobRoles: z.string().trim().max(500).optional().nullable(),
  preferredLocations: z.string().trim().max(500).optional().nullable(),
  expectedSalaryRange: z.string().trim().max(100).optional().nullable(),
  portfolioUrl: z.string().trim().url().optional().nullable(),
  isOpenToInternship: z.boolean().optional(),
  isOpenToFreelance: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided for update.' }
);

export type UpdateStudentProfileBody = z.infer<typeof updateStudentProfileBodySchema>;
