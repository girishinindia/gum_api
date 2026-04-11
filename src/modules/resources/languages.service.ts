// ═══════════════════════════════════════════════════════════════
// languages.service — UDF wrappers for the /api/v1/languages module.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateLanguageBody,
  ListLanguagesQuery,
  UpdateLanguageBody
} from './languages.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface LanguageDto {
  id: number;
  name: string;
  nativeName: string | null;
  isoCode: string | null;
  script: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface LanguageRow {
  language_id: number | string;
  language_name: string;
  language_native_name: string | null;
  language_iso_code: string | null;
  language_script: string | null;
  language_is_active: boolean;
  language_is_deleted: boolean;
  language_created_at: Date | string | null;
  language_updated_at: Date | string | null;
  language_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapLanguage = (row: LanguageRow): LanguageDto => ({
  id: Number(row.language_id),
  name: row.language_name,
  nativeName: row.language_native_name,
  isoCode: row.language_iso_code,
  script: row.language_script,
  isActive: row.language_is_active,
  isDeleted: row.language_is_deleted,
  createdAt: toIsoString(row.language_created_at),
  updatedAt: toIsoString(row.language_updated_at),
  deletedAt: toIsoString(row.language_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListLanguagesResult {
  rows: LanguageDto[];
  meta: PaginationMeta;
}

export const listLanguages = async (
  q: ListLanguagesQuery
): Promise<ListLanguagesResult> => {
  const { rows, totalCount } = await db.callTableFunction<LanguageRow>(
    'udf_get_languages',
    {
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_script: q.script ?? null,
      p_filter_iso_code: q.isoCode ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapLanguage),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getLanguageById = async (id: number): Promise<LanguageDto | null> => {
  const { rows } = await db.callTableFunction<LanguageRow>('udf_get_languages', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapLanguage(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateLanguageResult {
  id: number;
}

export const createLanguage = async (
  body: CreateLanguageBody,
  callerId: number | null
): Promise<CreateLanguageResult> => {
  const result = await db.callFunction('udf_languages_insert', {
    p_name: body.name,
    p_native_name: body.nativeName ?? null,
    p_iso_code: body.isoCode ?? null,
    p_script: body.script ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateLanguage = async (
  id: number,
  body: UpdateLanguageBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_languages_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_native_name: body.nativeName ?? null,
    p_iso_code: body.isoCode ?? null,
    p_script: body.script ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteLanguage = async (id: number): Promise<void> => {
  await db.callFunction('udf_languages_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreLanguage = async (id: number): Promise<void> => {
  await db.callFunction('udf_languages_restore', { p_id: id });
};
