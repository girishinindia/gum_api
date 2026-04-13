// ═══════════════════════════════════════════════════════════════
// branches.service — UDF wrappers for the /api/v1/branches module.
//
// Talks to phase-03 UDFs:
//   - udf_get_branches     (read/list)
//   - udf_branches_insert  (create)
//   - udf_branches_update  (update)
//   - udf_branches_delete  (soft delete)
//   - udf_branches_restore (restore)
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import { AppError } from '../../core/errors/app-error';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateBranchBody,
  ListBranchesQuery,
  UpdateBranchBody
} from './branches.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface BranchCityDto {
  id: number;
  stateId: number;
  name: string;
  phoneCode: string | null;
  timezone: string | null;
  website: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface BranchStateDto {
  id: number;
  countryId: number;
  name: string;
  languages: string[];
  website: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface BranchCountryDto {
  id: number;
  name: string;
  iso2: string;
  iso3: string;
  phoneCode: string | null;
  currency: string | null;
  currencyName: string | null;
  currencySymbol: string | null;
  nationalLanguage: string | null;
  nationality: string | null;
  languages: string[];
  tld: string | null;
  flagImage: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface BranchDto {
  id: number;
  countryId: number;
  stateId: number;
  cityId: number;
  branchManagerId: number | null;
  name: string;
  code: string | null;
  branchType: string;
  addressLine1: string | null;
  addressLine2: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  timezone: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  city: BranchCityDto;
  state: BranchStateDto;
  country: BranchCountryDto;
}

// ─── Row shape returned by udf_get_branches ──────────────────────

interface BranchRow {
  branch_id: number | string;
  branch_country_id: number | string;
  branch_state_id: number | string;
  branch_city_id: number | string;
  branch_branch_manager_id: number | string | null;
  branch_name: string;
  branch_code: string | null;
  branch_branch_type: string;
  branch_address_line_1: string | null;
  branch_address_line_2: string | null;
  branch_pincode: string | null;
  branch_phone: string | null;
  branch_email: string | null;
  branch_website: string | null;
  branch_google_maps_url: string | null;
  branch_timezone: string | null;
  branch_created_by: number | string | null;
  branch_updated_by: number | string | null;
  branch_is_active: boolean;
  branch_is_deleted: boolean;
  branch_created_at: Date | string | null;
  branch_updated_at: Date | string | null;
  branch_deleted_at: Date | string | null;

  city_id: number | string;
  city_state_id: number | string;
  city_name: string;
  city_phonecode: string | null;
  city_timezone: string | null;
  city_website: string | null;
  city_is_active: boolean;
  city_is_deleted: boolean;

  state_id: number | string;
  state_country_id: number | string;
  state_name: string;
  state_languages: unknown;
  state_website: string | null;
  state_is_active: boolean;
  state_is_deleted: boolean;

  country_id: number | string;
  country_name: string;
  country_iso2: string;
  country_iso3: string;
  country_phone_code: string | null;
  country_currency: string | null;
  country_currency_name: string | null;
  country_currency_symbol: string | null;
  country_national_language: string | null;
  country_nationality: string | null;
  country_languages: unknown;
  country_tld: string | null;
  country_flag_image: string | null;
  country_is_active: boolean;
  country_is_deleted: boolean;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

const mapBranch = (row: BranchRow): BranchDto => ({
  id: Number(row.branch_id),
  countryId: Number(row.branch_country_id),
  stateId: Number(row.branch_state_id),
  cityId: Number(row.branch_city_id),
  branchManagerId: toNumOrNull(row.branch_branch_manager_id),
  name: row.branch_name,
  code: row.branch_code,
  branchType: row.branch_branch_type,
  addressLine1: row.branch_address_line_1,
  addressLine2: row.branch_address_line_2,
  pincode: row.branch_pincode,
  phone: row.branch_phone,
  email: row.branch_email,
  website: row.branch_website,
  googleMapsUrl: row.branch_google_maps_url,
  timezone: row.branch_timezone,
  createdBy: toNumOrNull(row.branch_created_by),
  updatedBy: toNumOrNull(row.branch_updated_by),
  isActive: row.branch_is_active,
  isDeleted: row.branch_is_deleted,
  createdAt: toIsoString(row.branch_created_at),
  updatedAt: toIsoString(row.branch_updated_at),
  deletedAt: toIsoString(row.branch_deleted_at),
  city: {
    id: Number(row.city_id),
    stateId: Number(row.city_state_id),
    name: row.city_name,
    phoneCode: row.city_phonecode,
    timezone: row.city_timezone,
    website: row.city_website,
    isActive: row.city_is_active,
    isDeleted: row.city_is_deleted
  },
  state: {
    id: Number(row.state_id),
    countryId: Number(row.state_country_id),
    name: row.state_name,
    languages: asStringArray(row.state_languages),
    website: row.state_website,
    isActive: row.state_is_active,
    isDeleted: row.state_is_deleted
  },
  country: {
    id: Number(row.country_id),
    name: row.country_name,
    iso2: row.country_iso2,
    iso3: row.country_iso3,
    phoneCode: row.country_phone_code,
    currency: row.country_currency,
    currencyName: row.country_currency_name,
    currencySymbol: row.country_currency_symbol,
    nationalLanguage: row.country_national_language,
    nationality: row.country_nationality,
    languages: asStringArray(row.country_languages),
    tld: row.country_tld,
    flagImage: row.country_flag_image,
    isActive: row.country_is_active,
    isDeleted: row.country_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListBranchesResult {
  rows: BranchDto[];
  meta: PaginationMeta;
}

export const listBranches = async (
  q: ListBranchesQuery
): Promise<ListBranchesResult> => {
  const branchActive = q.branchIsActive ?? q.isActive ?? null;
  const branchDeleted = q.branchIsDeleted ?? q.isDeleted ?? null;

  const { rows, totalCount } = await db.callTableFunction<BranchRow>(
    'udf_get_branches',
    {
      p_country_is_active: q.countryIsActive ?? null,
      p_state_is_active: q.stateIsActive ?? null,
      p_city_is_active: q.cityIsActive ?? null,
      p_branch_is_active: branchActive,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_country_id: q.countryId ?? null,
      p_filter_state_id: q.stateId ?? null,
      p_filter_city_id: q.cityId ?? null,
      p_filter_branch_type: q.branchType ?? null,
      p_filter_branch_is_active: branchActive,
      p_filter_branch_is_deleted: branchDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapBranch),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getBranchById = async (id: number): Promise<BranchDto | null> => {
  const { rows } = await db.callTableFunction<BranchRow>('udf_get_branches', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapBranch(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateBranchResult {
  id: number;
}

/**
 * Validate that branch_manager_id references an existing, non-deleted user.
 */
const validateBranchManagerId = async (managerId: number): Promise<void> => {
  const row = await db.queryOne<{ id: number; is_deleted: boolean }>(
    'SELECT id, is_deleted FROM users WHERE id = $1',
    [managerId]
  );
  if (!row) {
    throw AppError.badRequest(`branchManagerId ${managerId}: user does not exist`);
  }
  if (row.is_deleted) {
    throw AppError.badRequest(`branchManagerId ${managerId}: user has been deleted`);
  }
};

export const createBranch = async (
  body: CreateBranchBody,
  callerId: number | null
): Promise<CreateBranchResult> => {
  if (body.branchManagerId) {
    await validateBranchManagerId(body.branchManagerId);
  }
  const result = await db.callFunction('udf_branches_insert', {
    p_country_id: body.countryId,
    p_state_id: body.stateId,
    p_city_id: body.cityId,
    p_name: body.name,
    p_code: body.code ?? null,
    p_branch_type: body.branchType ?? 'office',
    p_address_line_1: body.addressLine1 ?? null,
    p_address_line_2: body.addressLine2 ?? null,
    p_pincode: body.pincode ?? null,
    p_phone: body.phone ?? null,
    p_email: body.email ?? null,
    p_website: body.website ?? null,
    p_google_maps_url: body.googleMapsUrl ?? null,
    p_timezone: body.timezone ?? null,
    p_branch_manager_id: body.branchManagerId ?? null,
    p_is_active: body.isActive ?? false,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateBranch = async (
  id: number,
  body: UpdateBranchBody,
  callerId: number | null
): Promise<void> => {
  if (body.branchManagerId) {
    await validateBranchManagerId(body.branchManagerId);
  }
  await db.callFunction('udf_branches_update', {
    p_id: id,
    p_country_id: body.countryId ?? null,
    p_state_id: body.stateId ?? null,
    p_city_id: body.cityId ?? null,
    p_branch_manager_id: body.branchManagerId ?? null,
    p_name: body.name ?? null,
    p_code: body.code ?? null,
    p_branch_type: body.branchType ?? null,
    p_address_line_1: body.addressLine1 ?? null,
    p_address_line_2: body.addressLine2 ?? null,
    p_pincode: body.pincode ?? null,
    p_phone: body.phone ?? null,
    p_email: body.email ?? null,
    p_website: body.website ?? null,
    p_google_maps_url: body.googleMapsUrl ?? null,
    p_timezone: body.timezone ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteBranch = async (id: number): Promise<void> => {
  await db.callFunction('udf_branches_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreBranch = async (id: number): Promise<void> => {
  await db.callFunction('udf_branches_restore', { p_id: id });
};
