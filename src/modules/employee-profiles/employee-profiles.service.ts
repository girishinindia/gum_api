import { db } from '../../database/db';
import { buildPaginationMeta } from '../../core/utils/api-response';
import type { PaginationMeta } from '../../core/types/common.types';
import type {
  ListEmployeeProfilesQuery,
  CreateEmployeeProfileBody,
  UpdateEmployeeProfileBody,
} from './employee-profiles.schemas';

// ═══════════════════════════════════════════════════════════════
// Internal row type — mirrors udf_get_employee_profiles output
// ═══════════════════════════════════════════════════════════════

interface EmployeeProfileRow {
  emp_id: number | string;
  emp_user_id: number | string;
  emp_employee_code: string;
  emp_employee_type: string;
  emp_designation_id: number | string;
  emp_department_id: number | string;
  emp_branch_id: number | string;
  emp_reporting_manager_id: number | string | null;
  emp_joining_date: Date | string;
  emp_confirmation_date: Date | string | null;
  emp_probation_end_date: Date | string | null;
  emp_contract_end_date: Date | string | null;
  emp_resignation_date: Date | string | null;
  emp_last_working_date: Date | string | null;
  emp_relieving_date: Date | string | null;
  emp_work_mode: string;
  emp_shift_type: string | null;
  emp_shift_branch_id: number | string | null;
  emp_work_location: string | null;
  emp_weekly_off_days: string | null;
  emp_pay_grade: string | null;
  emp_salary_currency: string | null;
  emp_ctc_annual: number | string | null;
  emp_basic_salary_monthly: number | string | null;
  emp_payment_mode: string | null;
  emp_pf_number: string | null;
  emp_esi_number: string | null;
  emp_uan_number: string | null;
  emp_professional_tax_number: string | null;
  emp_tax_regime: string | null;
  emp_leave_balance_casual: number | string | null;
  emp_leave_balance_sick: number | string | null;
  emp_leave_balance_earned: number | string | null;
  emp_leave_balance_compensatory: number | string | null;
  emp_total_experience_years: number | string | null;
  emp_experience_at_joining: number | string | null;
  emp_has_system_access: boolean;
  emp_has_email_access: boolean;
  emp_has_vpn_access: boolean;
  emp_access_card_number: string | null;
  emp_laptop_asset_id: string | null;
  emp_exit_type: string | null;
  emp_exit_reason: string | null;
  emp_exit_interview_done: boolean | null;
  emp_full_and_final_done: boolean | null;
  emp_notice_period_days: number | null;
  emp_created_by: number | string | null;
  emp_updated_by: number | string | null;
  emp_is_active: boolean;
  emp_is_deleted: boolean;
  emp_created_at: Date | string;
  emp_updated_at: Date | string;
  emp_deleted_at: Date | string | null;
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
  // Designation
  designation_name: string;
  designation_code: string;
  designation_level: number | null;
  designation_level_band: string | null;
  // Department
  department_name: string;
  department_code: string;
  // Branch
  branch_name: string;
  branch_code: string;
  branch_branch_type: string | null;
  // Manager
  manager_first_name: string | null;
  manager_last_name: string | null;
  manager_email: string | null;
  // Shift branch
  shift_branch_name: string | null;
  // Pagination
  total_count: number | string;
}

// ═══════════════════════════════════════════════════════════════
// Public DTO
// ═══════════════════════════════════════════════════════════════

export interface EmployeeProfileDto {
  id: number;
  userId: number;
  employeeCode: string;
  employeeType: string;
  // Org placement
  designationId: number;
  designationName: string;
  designationCode: string;
  designationLevel: number | null;
  designationLevelBand: string | null;
  departmentId: number;
  departmentName: string;
  departmentCode: string;
  branchId: number;
  branchName: string;
  branchCode: string;
  branchType: string | null;
  reportingManagerId: number | null;
  managerFirstName: string | null;
  managerLastName: string | null;
  managerEmail: string | null;
  // Dates
  joiningDate: string;
  confirmationDate: string | null;
  probationEndDate: string | null;
  contractEndDate: string | null;
  resignationDate: string | null;
  lastWorkingDate: string | null;
  relievingDate: string | null;
  // Work
  workMode: string;
  shiftType: string | null;
  shiftBranchId: number | null;
  shiftBranchName: string | null;
  workLocation: string | null;
  weeklyOffDays: string | null;
  // Compensation
  payGrade: string | null;
  salaryCurrency: string | null;
  ctcAnnual: number | null;
  basicSalaryMonthly: number | null;
  paymentMode: string | null;
  // Statutory
  pfNumber: string | null;
  esiNumber: string | null;
  uanNumber: string | null;
  professionalTaxNumber: string | null;
  taxRegime: string | null;
  // Leave
  leaveBalanceCasual: number | null;
  leaveBalanceSick: number | null;
  leaveBalanceEarned: number | null;
  leaveBalanceCompensatory: number | null;
  // Experience
  totalExperienceYears: number | null;
  experienceAtJoining: number | null;
  // Access
  hasSystemAccess: boolean;
  hasEmailAccess: boolean;
  hasVpnAccess: boolean;
  accessCardNumber: string | null;
  laptopAssetId: string | null;
  // Exit
  exitType: string | null;
  exitReason: string | null;
  exitInterviewDone: boolean | null;
  fullAndFinalDone: boolean | null;
  noticePeriodDays: number | null;
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
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  // Use local date components to avoid UTC offset shifting dates by -1 day
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, '0');
  const d = String(v.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ═══════════════════════════════════════════════════════════════
// Row → DTO mapper
// ═══════════════════════════════════════════════════════════════

const mapEmployeeProfile = (r: EmployeeProfileRow): EmployeeProfileDto => ({
  id: Number(r.emp_id),
  userId: Number(r.emp_user_id),
  employeeCode: r.emp_employee_code,
  employeeType: r.emp_employee_type,
  // Org placement
  designationId: Number(r.emp_designation_id),
  designationName: r.designation_name,
  designationCode: r.designation_code,
  designationLevel: toNum(r.designation_level),
  designationLevelBand: r.designation_level_band,
  departmentId: Number(r.emp_department_id),
  departmentName: r.department_name,
  departmentCode: r.department_code,
  branchId: Number(r.emp_branch_id),
  branchName: r.branch_name,
  branchCode: r.branch_code,
  branchType: r.branch_branch_type,
  reportingManagerId: toNum(r.emp_reporting_manager_id),
  managerFirstName: r.manager_first_name,
  managerLastName: r.manager_last_name,
  managerEmail: r.manager_email,
  // Dates
  joiningDate: toIsoDate(r.emp_joining_date) ?? '',
  confirmationDate: toIsoDate(r.emp_confirmation_date),
  probationEndDate: toIsoDate(r.emp_probation_end_date),
  contractEndDate: toIsoDate(r.emp_contract_end_date),
  resignationDate: toIsoDate(r.emp_resignation_date),
  lastWorkingDate: toIsoDate(r.emp_last_working_date),
  relievingDate: toIsoDate(r.emp_relieving_date),
  // Work
  workMode: r.emp_work_mode,
  shiftType: r.emp_shift_type,
  shiftBranchId: toNum(r.emp_shift_branch_id),
  shiftBranchName: r.shift_branch_name,
  workLocation: r.emp_work_location,
  weeklyOffDays: r.emp_weekly_off_days,
  // Compensation
  payGrade: r.emp_pay_grade,
  salaryCurrency: r.emp_salary_currency,
  ctcAnnual: toNum(r.emp_ctc_annual),
  basicSalaryMonthly: toNum(r.emp_basic_salary_monthly),
  paymentMode: r.emp_payment_mode,
  // Statutory
  pfNumber: r.emp_pf_number,
  esiNumber: r.emp_esi_number,
  uanNumber: r.emp_uan_number,
  professionalTaxNumber: r.emp_professional_tax_number,
  taxRegime: r.emp_tax_regime,
  // Leave
  leaveBalanceCasual: toNum(r.emp_leave_balance_casual),
  leaveBalanceSick: toNum(r.emp_leave_balance_sick),
  leaveBalanceEarned: toNum(r.emp_leave_balance_earned),
  leaveBalanceCompensatory: toNum(r.emp_leave_balance_compensatory),
  // Experience
  totalExperienceYears: toNum(r.emp_total_experience_years),
  experienceAtJoining: toNum(r.emp_experience_at_joining),
  // Access
  hasSystemAccess: r.emp_has_system_access,
  hasEmailAccess: r.emp_has_email_access,
  hasVpnAccess: r.emp_has_vpn_access,
  accessCardNumber: r.emp_access_card_number,
  laptopAssetId: r.emp_laptop_asset_id,
  // Exit
  exitType: r.emp_exit_type,
  exitReason: r.emp_exit_reason,
  exitInterviewDone: r.emp_exit_interview_done,
  fullAndFinalDone: r.emp_full_and_final_done,
  noticePeriodDays: toNum(r.emp_notice_period_days),
  // Audit
  createdBy: toNum(r.emp_created_by),
  updatedBy: toNum(r.emp_updated_by),
  isActive: r.emp_is_active,
  isDeleted: r.emp_is_deleted,
  createdAt: toIso(r.emp_created_at) ?? '',
  updatedAt: toIso(r.emp_updated_at) ?? '',
  deletedAt: toIso(r.emp_deleted_at),
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

export interface ListEmployeeProfilesResult {
  rows: EmployeeProfileDto[];
  meta: PaginationMeta;
}

export const listEmployeeProfiles = async (
  q: ListEmployeeProfilesQuery,
): Promise<ListEmployeeProfilesResult> => {
  const { rows, totalCount } = await db.callTableFunction<EmployeeProfileRow>(
    'udf_get_employee_profiles',
    {
      p_sort_table: q.sortTable ?? undefined,
      p_sort_column: q.sortColumn ?? undefined,
      p_sort_direction: q.sortDirection ?? undefined,
      p_filter_employee_type: q.filterEmployeeType ?? undefined,
      p_filter_work_mode: q.filterWorkMode ?? undefined,
      p_filter_shift_type: q.filterShiftType ?? undefined,
      p_filter_pay_grade: q.filterPayGrade ?? undefined,
      p_filter_tax_regime: q.filterTaxRegime ?? undefined,
      p_filter_exit_type: q.filterExitType ?? undefined,
      p_filter_payment_mode: q.filterPaymentMode ?? undefined,
      p_filter_has_system_access: q.filterHasSystemAccess ?? undefined,
      p_filter_has_vpn_access: q.filterHasVpnAccess ?? undefined,
      p_filter_is_active: q.filterIsActive ?? undefined,
      p_filter_is_deleted: q.filterIsDeleted ?? undefined,
      p_filter_designation_id: q.filterDesignationId ?? undefined,
      p_filter_department_id: q.filterDepartmentId ?? undefined,
      p_filter_branch_id: q.filterBranchId ?? undefined,
      p_filter_reporting_manager_id: q.filterReportingManagerId ?? undefined,
      p_filter_user_role: q.filterUserRole ?? undefined,
      p_filter_user_is_active: q.filterUserIsActive ?? undefined,
      p_search_term: q.searchTerm ?? undefined,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize,
    },
  );

  return {
    rows: rows.map(mapEmployeeProfile),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount),
  };
};

export const getEmployeeProfileById = async (
  id: number,
): Promise<EmployeeProfileDto | null> => {
  const { rows } = await db.callTableFunction<EmployeeProfileRow>(
    'udf_get_employee_profiles',
    { p_id: id },
  );
  return rows[0] ? mapEmployeeProfile(rows[0]) : null;
};

export const getEmployeeProfileByUserId = async (
  userId: number,
): Promise<EmployeeProfileDto | null> => {
  const { rows } = await db.callTableFunction<EmployeeProfileRow>(
    'udf_get_employee_profiles',
    { p_user_id: userId },
  );
  return rows[0] ? mapEmployeeProfile(rows[0]) : null;
};

// ── Param builders ──────────────────────────────────────────

const buildInsertParams = (
  body: CreateEmployeeProfileBody,
  callerId: number | null,
): Record<string, unknown> => ({
  p_user_id: body.userId,
  p_employee_code: body.employeeCode,
  p_designation_id: body.designationId,
  p_department_id: body.departmentId,
  p_branch_id: body.branchId,
  p_joining_date: body.joiningDate,
  p_employee_type: body.employeeType ?? null,
  p_reporting_manager_id: body.reportingManagerId ?? null,
  p_confirmation_date: body.confirmationDate ?? null,
  p_probation_end_date: body.probationEndDate ?? null,
  p_contract_end_date: body.contractEndDate ?? null,
  p_work_mode: body.workMode ?? null,
  p_shift_type: body.shiftType ?? null,
  p_shift_branch_id: body.shiftBranchId ?? null,
  p_work_location: body.workLocation ?? null,
  p_weekly_off_days: body.weeklyOffDays ?? null,
  p_pay_grade: body.payGrade ?? null,
  p_salary_currency: body.salaryCurrency ?? null,
  p_ctc_annual: body.ctcAnnual ?? null,
  p_basic_salary_monthly: body.basicSalaryMonthly ?? null,
  p_payment_mode: body.paymentMode ?? null,
  p_pf_number: body.pfNumber ?? null,
  p_esi_number: body.esiNumber ?? null,
  p_uan_number: body.uanNumber ?? null,
  p_professional_tax_number: body.professionalTaxNumber ?? null,
  p_tax_regime: body.taxRegime ?? null,
  p_leave_balance_casual: body.leaveBalanceCasual ?? null,
  p_leave_balance_sick: body.leaveBalanceSick ?? null,
  p_leave_balance_earned: body.leaveBalanceEarned ?? null,
  p_leave_balance_compensatory: body.leaveBalanceCompensatory ?? null,
  p_total_experience_years: body.totalExperienceYears ?? null,
  p_experience_at_joining: body.experienceAtJoining ?? null,
  p_has_system_access: body.hasSystemAccess ?? null,
  p_has_email_access: body.hasEmailAccess ?? null,
  p_has_vpn_access: body.hasVpnAccess ?? null,
  p_access_card_number: body.accessCardNumber ?? null,
  p_laptop_asset_id: body.laptopAssetId ?? null,
  p_notice_period_days: body.noticePeriodDays ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId,
});

const buildUpdateParams = (
  id: number,
  body: UpdateEmployeeProfileBody,
  callerId: number | null,
): Record<string, unknown> => ({
  p_id: id,
  p_employee_code: body.employeeCode ?? null,
  p_employee_type: body.employeeType ?? null,
  p_designation_id: body.designationId ?? null,
  p_department_id: body.departmentId ?? null,
  p_branch_id: body.branchId ?? null,
  p_reporting_manager_id: body.reportingManagerId ?? null,
  p_joining_date: body.joiningDate ?? null,
  p_confirmation_date: body.confirmationDate ?? null,
  p_probation_end_date: body.probationEndDate ?? null,
  p_contract_end_date: body.contractEndDate ?? null,
  p_resignation_date: body.resignationDate ?? null,
  p_last_working_date: body.lastWorkingDate ?? null,
  p_relieving_date: body.relievingDate ?? null,
  p_work_mode: body.workMode ?? null,
  p_shift_type: body.shiftType ?? null,
  p_shift_branch_id: body.shiftBranchId ?? null,
  p_work_location: body.workLocation ?? null,
  p_weekly_off_days: body.weeklyOffDays ?? null,
  p_pay_grade: body.payGrade ?? null,
  p_salary_currency: body.salaryCurrency ?? null,
  p_ctc_annual: body.ctcAnnual ?? null,
  p_basic_salary_monthly: body.basicSalaryMonthly ?? null,
  p_payment_mode: body.paymentMode ?? null,
  p_pf_number: body.pfNumber ?? null,
  p_esi_number: body.esiNumber ?? null,
  p_uan_number: body.uanNumber ?? null,
  p_professional_tax_number: body.professionalTaxNumber ?? null,
  p_tax_regime: body.taxRegime ?? null,
  p_leave_balance_casual: body.leaveBalanceCasual ?? null,
  p_leave_balance_sick: body.leaveBalanceSick ?? null,
  p_leave_balance_earned: body.leaveBalanceEarned ?? null,
  p_leave_balance_compensatory: body.leaveBalanceCompensatory ?? null,
  p_total_experience_years: body.totalExperienceYears ?? null,
  p_experience_at_joining: body.experienceAtJoining ?? null,
  p_has_system_access: body.hasSystemAccess ?? null,
  p_has_email_access: body.hasEmailAccess ?? null,
  p_has_vpn_access: body.hasVpnAccess ?? null,
  p_access_card_number: body.accessCardNumber ?? null,
  p_laptop_asset_id: body.laptopAssetId ?? null,
  p_exit_type: body.exitType ?? null,
  p_exit_reason: body.exitReason ?? null,
  p_exit_interview_done: body.exitInterviewDone ?? null,
  p_full_and_final_done: body.fullAndFinalDone ?? null,
  p_notice_period_days: body.noticePeriodDays ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId,
});

// ── Mutations ───────────────────────────────────────────────

export interface CreateEmployeeProfileResult {
  id: number;
}

export const createEmployeeProfile = async (
  body: CreateEmployeeProfileBody,
  callerId: number | null,
): Promise<CreateEmployeeProfileResult> => {
  const result = await db.callFunction(
    'udf_insert_employee_profiles',
    buildInsertParams(body, callerId),
  );
  return { id: Number(result.id) };
};

export const updateEmployeeProfile = async (
  id: number,
  body: UpdateEmployeeProfileBody,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction(
    'udf_update_employee_profiles',
    buildUpdateParams(id, body, callerId),
  );
};

export const deleteEmployeeProfile = async (
  id: number,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction('udf_delete_employee_profiles', {
    p_id: id,
    p_actor_id: callerId,
  });
};

export const restoreEmployeeProfile = async (
  id: number,
  callerId: number | null,
): Promise<void> => {
  await db.callFunction('udf_restore_employee_profiles', {
    p_id: id,
    p_actor_id: callerId,
  });
};
