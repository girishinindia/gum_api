// ═══════════════════════════════════════════════════════════════
// cities.service — UDF wrappers for the /api/v1/cities module.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCityBody,
  ListCitiesQuery,
  UpdateCityBody
} from './cities.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CityCountryDto {
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

export interface CityStateDto {
  id: number;
  countryId: number;
  name: string;
  languages: string[];
  website: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface CityDto {
  id: number;
  stateId: number;
  name: string;
  phoneCode: string | null;
  timezone: string | null;
  website: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  state: CityStateDto;
  country: CityCountryDto;
}

interface CityRow {
  city_id: number | string;
  city_state_id: number | string;
  city_name: string;
  city_phonecode: string | null;
  city_timezone: string | null;
  city_website: string | null;
  city_is_active: boolean;
  city_is_deleted: boolean;
  city_created_at: Date | string | null;
  city_updated_at: Date | string | null;
  city_deleted_at: Date | string | null;

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

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

const mapCity = (row: CityRow): CityDto => ({
  id: Number(row.city_id),
  stateId: Number(row.city_state_id),
  name: row.city_name,
  phoneCode: row.city_phonecode,
  timezone: row.city_timezone,
  website: row.city_website,
  isActive: row.city_is_active,
  isDeleted: row.city_is_deleted,
  createdAt: toIsoString(row.city_created_at),
  updatedAt: toIsoString(row.city_updated_at),
  deletedAt: toIsoString(row.city_deleted_at),
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

export interface ListCitiesResult {
  rows: CityDto[];
  meta: PaginationMeta;
}

export const listCities = async (q: ListCitiesQuery): Promise<ListCitiesResult> => {
  const cityActive = q.cityIsActive ?? q.isActive ?? null;
  const cityDeleted = q.cityIsDeleted ?? q.isDeleted ?? null;

  const { rows, totalCount } = await db.callTableFunction<CityRow>(
    'udf_getcities',
    {
      p_country_is_active: q.countryIsActive ?? null,
      p_state_is_active: q.stateIsActive ?? null,
      p_city_is_active: cityActive,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_country_iso3: q.countryIso3 ?? null,
      p_filter_country_languages: q.countryLanguage ?? null,
      p_filter_country_is_active: q.countryIsActive ?? null,
      p_filter_country_is_deleted: q.countryIsDeleted ?? null,
      p_filter_state_languages: q.stateLanguage ?? null,
      p_filter_state_is_active: q.stateIsActive ?? null,
      p_filter_state_is_deleted: q.stateIsDeleted ?? null,
      p_filter_city_timezone: q.cityTimezone ?? null,
      p_filter_city_is_active: cityActive,
      p_filter_city_is_deleted: cityDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCity),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getCityById = async (id: number): Promise<CityDto | null> => {
  const { rows } = await db.callTableFunction<CityRow>('udf_getcities', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapCity(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateCityResult {
  id: number;
}

export const createCity = async (
  body: CreateCityBody,
  callerId: number | null
): Promise<CreateCityResult> => {
  const result = await db.callFunction('udf_cities_insert', {
    p_state_id: body.stateId,
    p_name: body.name,
    p_phonecode: body.phoneCode ?? null,
    p_timezone: body.timezone ?? null,
    p_website: body.website ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateCity = async (
  id: number,
  body: UpdateCityBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_cities_update', {
    p_id: id,
    p_state_id: body.stateId ?? null,
    p_name: body.name ?? null,
    p_phonecode: body.phoneCode ?? null,
    p_timezone: body.timezone ?? null,
    p_website: body.website ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteCity = async (id: number): Promise<void> => {
  await db.callFunction('udf_cities_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreCity = async (id: number): Promise<void> => {
  await db.callFunction('udf_cities_restore', { p_id: id });
};
