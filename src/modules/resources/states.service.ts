// ═══════════════════════════════════════════════════════════════
// states.service — UDF wrappers for the /api/v1/states module.
//
// All access goes through `db.callFunction` (mutations, JSONB) or
// `db.callTableFunction` (reads, returns rows + total_count).
// Handlers stay thin — they just translate from req → service
// input and back.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';

import type {
  CreateStateBody,
  ListStatesQuery,
  UpdateStateBody
} from './states.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface StateCountryDto {
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

export interface StateDto {
  id: number;
  countryId: number;
  name: string;
  languages: string[];
  website: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  country: StateCountryDto;
}

/** Raw row shape returned by `udf_getstates` (camelCase of view columns). */
interface StateRow {
  state_id: number | string;
  state_country_id: number | string;
  state_name: string;
  state_languages: unknown;
  state_website: string | null;
  state_is_active: boolean;
  state_is_deleted: boolean;
  state_created_at: Date | string | null;
  state_updated_at: Date | string | null;
  state_deleted_at: Date | string | null;

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

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

const mapState = (row: StateRow): StateDto => ({
  id: Number(row.state_id),
  countryId: Number(row.state_country_id),
  name: row.state_name,
  languages: asStringArray(row.state_languages),
  website: row.state_website,
  isActive: row.state_is_active,
  isDeleted: row.state_is_deleted,
  createdAt: toIsoString(row.state_created_at),
  updatedAt: toIsoString(row.state_updated_at),
  deletedAt: toIsoString(row.state_deleted_at),
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

export interface ListStatesResult {
  rows: StateDto[];
  meta: PaginationMeta;
}

export const listStates = async (q: ListStatesQuery): Promise<ListStatesResult> => {
  // The top-level convenience `isActive`/`isDeleted` maps to the state
  // side of the JOIN; callers that need to target the country side
  // must use `countryIsActive` / `countryIsDeleted` explicitly.
  const stateActive = q.stateIsActive ?? q.isActive ?? null;
  const { filterIsDeleted: countryDeleted, hideDeleted: hideCountryDeleted } =
    resolveIsDeletedFilter(q.countryIsDeleted);
  const { filterIsDeleted: stateDeleted, hideDeleted: hideStateDeleted } =
    resolveIsDeletedFilter(q.stateIsDeleted ?? q.isDeleted);

  const { rows, totalCount } = await db.callTableFunction<StateRow>(
    'udf_getstates',
    {
      p_country_is_active: q.countryIsActive ?? null,
      p_state_is_active: stateActive,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_country_iso3: q.countryIso3 ?? null,
      p_filter_country_languages: q.countryLanguage ?? null,
      p_filter_country_is_active: q.countryIsActive ?? null,
      p_filter_country_is_deleted: countryDeleted,
      p_hide_country_deleted: hideCountryDeleted,
      p_filter_state_languages: q.stateLanguage ?? null,
      p_filter_state_is_active: stateActive,
      p_filter_state_is_deleted: stateDeleted,
      p_hide_state_deleted: hideStateDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapState),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getStateById = async (id: number): Promise<StateDto | null> => {
  const { rows } = await db.callTableFunction<StateRow>('udf_getstates', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapState(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateStateResult {
  id: number;
}

export const createState = async (
  body: CreateStateBody,
  callerId: number | null
): Promise<CreateStateResult> => {
  const result = await db.callFunction('udf_states_insert', {
    p_country_id: body.countryId,
    p_name: body.name,
    p_languages: body.languages ? JSON.stringify(body.languages) : null,
    p_website: body.website ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateState = async (
  id: number,
  body: UpdateStateBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_states_update', {
    p_id: id,
    p_country_id: body.countryId ?? null,
    p_name: body.name ?? null,
    p_languages: body.languages ? JSON.stringify(body.languages) : null,
    p_website: body.website ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteState = async (id: number): Promise<void> => {
  await db.callFunction('udf_states_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreState = async (id: number): Promise<void> => {
  await db.callFunction('udf_states_restore', { p_id: id });
};
