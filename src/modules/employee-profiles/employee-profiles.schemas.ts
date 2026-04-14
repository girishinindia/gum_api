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

export const EMPLOYEE_TYPE = [
  'full_time', 'part_time', 'contract', 'probation',
  'intern', 'consultant', 'temporary', 'freelance',
] as const;

export const WORK_MODE = ['on_site', 'remote', 'hybrid'] as const;

export const SHIFT_TYPE = [
  'general', 'morning', 'afternoon', 'night',
  'rotational', 'flexible', 'other',
] as const;

export const PAYMENT_MODE = [
  'bank_transfer', 'cheque', 'cash', 'upi', 'other',
] as const;

export const TAX_REGIME = ['old', 'new'] as const;

export const EXIT_TYPE = [
  'resignation', 'termination', 'retirement', 'contract_end',
  'absconding', 'mutual_separation', 'other',
] as const;

// ── Sort whitelist ──────────────────────────────────────────

export const EMPLOYEE_PROFILE_SORT_TABLES = [
  'emp', 'designation', 'department', 'branch', 'user',
] as const;

export const EMPLOYEE_PROFILE_SORT_COLUMNS_EMP = [
  'id', 'employee_code', 'employee_type', 'joining_date',
  'work_mode', 'shift_type', 'pay_grade', 'ctc_annual',
  'total_experience_years', 'notice_period_days',
  'is_active', 'created_at', 'updated_at',
] as const;

export const EMPLOYEE_PROFILE_SORT_COLUMNS_DESIGNATION = [
  'name', 'level', 'level_band',
] as const;

export const EMPLOYEE_PROFILE_SORT_COLUMNS_DEPARTMENT = [
  'name', 'code',
] as const;

export const EMPLOYEE_PROFILE_SORT_COLUMNS_BRANCH = [
  'name', 'code',
] as const;

export const EMPLOYEE_PROFILE_SORT_COLUMNS_USER = [
  'first_name', 'last_name', 'email', 'role',
] as const;

// ═══════════════════════════════════════════════════════════════
// List query schema
// ═══════════════════════════════════════════════════════════════

export const listEmployeeProfilesQuerySchema = paginationSchema.extend({
  // Sort
  sortTable: z.enum(EMPLOYEE_PROFILE_SORT_TABLES).default('emp').optional(),
  sortColumn: z.string().default('id').optional(),
  sortDirection: sortDirectionSchema.optional(),

  // Filters — employee
  filterEmployeeType: z.enum(EMPLOYEE_TYPE).optional(),
  filterWorkMode: z.enum(WORK_MODE).optional(),
  filterShiftType: z.enum(SHIFT_TYPE).optional(),
  filterPayGrade: z.string().trim().optional(),
  filterTaxRegime: z.enum(TAX_REGIME).optional(),
  filterExitType: z.enum(EXIT_TYPE).optional(),
  filterPaymentMode: z.enum(PAYMENT_MODE).optional(),
  filterHasSystemAccess: queryBooleanSchema.optional(),
  filterHasVpnAccess: queryBooleanSchema.optional(),
  filterIsActive: queryBooleanSchema.optional(),
  filterIsDeleted: queryBooleanSchema.optional(),

  // Filters — FK
  filterDesignationId: bigintIdSchema.optional(),
  filterDepartmentId: bigintIdSchema.optional(),
  filterBranchId: bigintIdSchema.optional(),
  filterReportingManagerId: bigintIdSchema.optional(),

  // Filters — user
  filterUserRole: z.string().trim().optional(),
  filterUserIsActive: queryBooleanSchema.optional(),

  // Search
  searchTerm: searchTermSchema.optional(),
});

export type ListEmployeeProfilesQuery = z.infer<typeof listEmployeeProfilesQuerySchema>;

// ═══════════════════════════════════════════════════════════════
// Create body schema
// ═══════════════════════════════════════════════════════════════

export const createEmployeeProfileBodySchema = z.object({
  userId: bigintIdSchema,
  employeeCode: z.string().trim().min(1).max(50),
  designationId: bigintIdSchema,
  departmentId: bigintIdSchema,
  branchId: bigintIdSchema,
  joiningDate: z.string().trim().min(1),  // ISO date string

  // Optionals
  employeeType: z.enum(EMPLOYEE_TYPE).optional(),
  reportingManagerId: bigintIdSchema.optional().nullable(),
  confirmationDate: z.string().trim().optional().nullable(),
  probationEndDate: z.string().trim().optional().nullable(),
  contractEndDate: z.string().trim().optional().nullable(),
  workMode: z.enum(WORK_MODE).optional(),
  shiftType: z.enum(SHIFT_TYPE).optional(),
  shiftBranchId: bigintIdSchema.optional().nullable(),
  workLocation: z.string().trim().max(255).optional().nullable(),
  weeklyOffDays: z.string().trim().max(100).optional(),

  // Compensation
  payGrade: z.string().trim().max(10).optional().nullable(),
  salaryCurrency: z.string().trim().max(5).optional(),
  ctcAnnual: z.number().nonnegative().optional().nullable(),
  basicSalaryMonthly: z.number().nonnegative().optional().nullable(),
  paymentMode: z.enum(PAYMENT_MODE).optional(),

  // Statutory
  pfNumber: z.string().trim().max(50).optional().nullable(),
  esiNumber: z.string().trim().max(50).optional().nullable(),
  uanNumber: z.string().trim().max(50).optional().nullable(),
  professionalTaxNumber: z.string().trim().max(50).optional().nullable(),
  taxRegime: z.enum(TAX_REGIME).optional(),

  // Leave balances
  leaveBalanceCasual: z.number().nonnegative().optional(),
  leaveBalanceSick: z.number().nonnegative().optional(),
  leaveBalanceEarned: z.number().nonnegative().optional(),
  leaveBalanceCompensatory: z.number().nonnegative().optional(),

  // Experience
  totalExperienceYears: z.number().nonnegative().optional().nullable(),
  experienceAtJoining: z.number().nonnegative().optional().nullable(),

  // Access
  hasSystemAccess: z.boolean().optional(),
  hasEmailAccess: z.boolean().optional(),
  hasVpnAccess: z.boolean().optional(),
  accessCardNumber: z.string().trim().max(50).optional().nullable(),
  laptopAssetId: z.string().trim().max(50).optional().nullable(),

  // Misc
  noticePeriodDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export type CreateEmployeeProfileBody = z.infer<typeof createEmployeeProfileBodySchema>;

// ═══════════════════════════════════════════════════════════════
// Update body schema  (all fields optional, at least one required)
// ═══════════════════════════════════════════════════════════════

export const updateEmployeeProfileBodySchema = z.object({
  employeeCode: z.string().trim().min(1).max(50).optional(),
  employeeType: z.enum(EMPLOYEE_TYPE).optional(),
  designationId: bigintIdSchema.optional(),
  departmentId: bigintIdSchema.optional(),
  branchId: bigintIdSchema.optional(),
  reportingManagerId: bigintIdSchema.optional().nullable(),
  joiningDate: z.string().trim().optional(),
  confirmationDate: z.string().trim().optional().nullable(),
  probationEndDate: z.string().trim().optional().nullable(),
  contractEndDate: z.string().trim().optional().nullable(),
  resignationDate: z.string().trim().optional().nullable(),
  lastWorkingDate: z.string().trim().optional().nullable(),
  relievingDate: z.string().trim().optional().nullable(),
  workMode: z.enum(WORK_MODE).optional(),
  shiftType: z.enum(SHIFT_TYPE).optional(),
  shiftBranchId: bigintIdSchema.optional().nullable(),
  workLocation: z.string().trim().max(255).optional().nullable(),
  weeklyOffDays: z.string().trim().max(100).optional(),
  payGrade: z.string().trim().max(10).optional().nullable(),
  salaryCurrency: z.string().trim().max(5).optional(),
  ctcAnnual: z.number().nonnegative().optional().nullable(),
  basicSalaryMonthly: z.number().nonnegative().optional().nullable(),
  paymentMode: z.enum(PAYMENT_MODE).optional(),
  pfNumber: z.string().trim().max(50).optional().nullable(),
  esiNumber: z.string().trim().max(50).optional().nullable(),
  uanNumber: z.string().trim().max(50).optional().nullable(),
  professionalTaxNumber: z.string().trim().max(50).optional().nullable(),
  taxRegime: z.enum(TAX_REGIME).optional(),
  leaveBalanceCasual: z.number().nonnegative().optional(),
  leaveBalanceSick: z.number().nonnegative().optional(),
  leaveBalanceEarned: z.number().nonnegative().optional(),
  leaveBalanceCompensatory: z.number().nonnegative().optional(),
  totalExperienceYears: z.number().nonnegative().optional().nullable(),
  experienceAtJoining: z.number().nonnegative().optional().nullable(),
  hasSystemAccess: z.boolean().optional(),
  hasEmailAccess: z.boolean().optional(),
  hasVpnAccess: z.boolean().optional(),
  accessCardNumber: z.string().trim().max(50).optional().nullable(),
  laptopAssetId: z.string().trim().max(50).optional().nullable(),
  exitType: z.enum(EXIT_TYPE).optional().nullable(),
  exitReason: z.string().trim().max(500).optional().nullable(),
  exitInterviewDone: z.boolean().optional(),
  fullAndFinalDone: z.boolean().optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided for update.' }
);

export type UpdateEmployeeProfileBody = z.infer<typeof updateEmployeeProfileBodySchema>;
