// ═══════════════════════════════════════════════════════════════
// countries.service — UDF wrappers for the countries CRUD module.
//
// All access goes through `db.callFunction` (mutations, JSONB) or
// `db.callTableFunction` (reads, returns rows + total_count).
// Handlers stay thin — they just translate from req → service input
// and back.
// ═══════════════════════════════════════════════════════════════

import sharp from 'sharp';

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import { env } from '../../config/env';
import { bunnyStorageService } from '../../integrations/bunny/bunny-storage.service';

import type {
  CreateCountryBody,
  ListCountriesQuery,
  UpdateCountryBody
} from './countries.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CountryDto {
  id: number;
  name: string;
  iso2: string;
  iso3: string;
  phoneCode: string | null;
  nationality: string | null;
  nationalLanguage: string | null;
  languages: string[];
  tld: string | null;
  currency: string | null;
  currencyName: string | null;
  currencySymbol: string | null;
  flagImage: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface CountryRow {
  country_id: number | string;
  country_name: string;
  country_iso2: string;
  country_iso3: string;
  country_phone_code: string | null;
  country_nationality: string | null;
  country_national_language: string | null;
  country_languages: unknown;
  country_tld: string | null;
  country_currency: string | null;
  country_currency_name: string | null;
  country_currency_symbol: string | null;
  country_flag_image: string | null;
  country_is_active: boolean;
  country_is_deleted: boolean;
  country_created_at: Date | string | null;
  country_updated_at: Date | string | null;
  country_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapCountry = (row: CountryRow): CountryDto => ({
  id: Number(row.country_id),
  name: row.country_name,
  iso2: row.country_iso2,
  iso3: row.country_iso3,
  phoneCode: row.country_phone_code,
  nationality: row.country_nationality,
  nationalLanguage: row.country_national_language,
  languages: Array.isArray(row.country_languages) ? (row.country_languages as string[]) : [],
  tld: row.country_tld,
  currency: row.country_currency,
  currencyName: row.country_currency_name,
  currencySymbol: row.country_currency_symbol,
  flagImage: row.country_flag_image,
  isActive: row.country_is_active,
  isDeleted: row.country_is_deleted,
  createdAt: toIsoString(row.country_created_at),
  updatedAt: toIsoString(row.country_updated_at),
  deletedAt: toIsoString(row.country_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListCountriesResult {
  rows: CountryDto[];
  meta: PaginationMeta;
}

export const listCountries = async (
  q: ListCountriesQuery
): Promise<ListCountriesResult> => {
  const { rows, totalCount } = await db.callTableFunction<CountryRow>(
    'udf_get_countries',
    {
      p_is_active: q.isActive ?? null,
      p_filter_iso2: q.iso2 ?? null,
      p_filter_iso3: q.iso3 ?? null,
      p_filter_phone_code: q.phoneCode ?? null,
      p_filter_currency: q.currency ?? null,
      p_filter_nationality: q.nationality ?? null,
      p_filter_national_language: q.nationalLanguage ?? null,
      p_filter_languages: q.language ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCountry),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getCountryById = async (id: number): Promise<CountryDto | null> => {
  const { rows } = await db.callTableFunction<CountryRow>('udf_get_countries', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapCountry(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateCountryResult {
  id: number;
}

export const createCountry = async (
  body: CreateCountryBody,
  callerId: number | null
): Promise<CreateCountryResult> => {
  const result = await db.callFunction('udf_countries_insert', {
    p_name: body.name,
    p_iso2: body.iso2,
    p_iso3: body.iso3,
    p_phone_code: body.phoneCode ?? null,
    p_currency: body.currency ?? null,
    p_currency_name: body.currencyName ?? null,
    p_currency_symbol: body.currencySymbol ?? null,
    p_national_language: body.nationalLanguage ?? null,
    p_nationality: body.nationality ?? null,
    p_languages: body.languages ? JSON.stringify(body.languages) : null,
    p_tld: body.tld ?? null,
    p_flag_image: null,  // set only by processCountryFlagUpload pipeline
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────
//
// PATCH /countries/:id — scalar fields only. `flagImage` is NOT part of
// `UpdateCountryBody` on purpose: the only way to change a flag is the
// `POST /:id/flag` upload endpoint, which enforces WebP conversion,
// deterministic ISO3 naming, and delete-then-upload semantics. Routing
// flag changes through the upload path guarantees those invariants can
// never be bypassed by a hand-crafted PATCH body.

export const updateCountry = async (
  id: number,
  body: UpdateCountryBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_countries_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_iso2: body.iso2 ?? null,
    p_iso3: body.iso3 ?? null,
    p_phone_code: body.phoneCode ?? null,
    p_currency: body.currency ?? null,
    p_currency_name: body.currencyName ?? null,
    p_currency_symbol: body.currencySymbol ?? null,
    p_national_language: body.nationalLanguage ?? null,
    p_nationality: body.nationality ?? null,
    p_languages: body.languages ? JSON.stringify(body.languages) : null,
    p_tld: body.tld ?? null,
    p_flag_image: null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

/**
 * Internal-only: persist a new flag image URL after a successful
 * Bunny upload. Not exported via any route — the flag upload endpoint
 * is the single entry point.
 */
const setCountryFlagImage = async (
  id: number,
  flagImageUrl: string,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_countries_update', {
    p_id: id,
    p_name: null,
    p_iso2: null,
    p_iso3: null,
    p_phone_code: null,
    p_currency: null,
    p_currency_name: null,
    p_currency_symbol: null,
    p_national_language: null,
    p_nationality: null,
    p_languages: null,
    p_tld: null,
    p_flag_image: flagImageUrl,
    p_is_active: null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteCountry = async (id: number): Promise<void> => {
  await db.callFunction('udf_countries_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreCountry = async (id: number): Promise<void> => {
  await db.callFunction('udf_countries_restore', { p_id: id });
};

// ─── Flag image upload (Bunny CDN) ───────────────────────────────
//
// Pipeline: multer buffer → sharp validate (90×90) → sharp re-encode
// (WebP) → delete prior flag(s) from Bunny → bunnyStorageService.upload(...)
// → udf_countries_update with the resulting CDN URL → return the refreshed row.
//
// Key rules baked in here (NOT in the route) so the contract survives
// any future caller (cron jobs, internal scripts, batch importers):
//   • dimensions MUST be exactly 90×90 px
//   • output is always WebP, regardless of input MIME
//   • storage key is deterministic (`countries/flags/<iso3>.webp`, e.g.
//     `countries/flags/ind.webp`) so re-uploads hit the same object
//     and the CDN URL stays stable
//   • BEFORE the new upload, we explicitly delete:
//       (a) the new ISO3 key (belt-and-braces — most re-uploads land
//           on the same path and Bunny's PUT would overwrite anyway,
//           but an explicit delete guarantees cache-consistent replace)
//       (b) the legacy ISO2 key (`countries/flags/<iso2>.webp`) left
//           behind by older code so no orphaned objects accumulate
//       (c) any path derived from `existing.flagImage` that does not
//           already match (a) or (b) — catches historical alternate
//           keys (e.g. uuid-based names) from earlier migrations
//     Each delete is best-effort: failures are logged at WARN and do
//     not block the new upload. Bunny's DELETE returns non-OK on 404,
//     which `safeDeleteFromBunny` swallows as a debug-level no-op.
//
// The 25 KB upper bound is enforced one layer earlier by multer in
// `core/middlewares/upload.ts` — by the time we get the buffer here
// it has already passed that check.

const FLAG_REQUIRED_WIDTH = 90;
const FLAG_REQUIRED_HEIGHT = 90;

/**
 * Extract the Bunny storage path from a CDN URL we wrote ourselves.
 *
 * We compare against `env.BUNNY_CDN_URL` so we only ever try to delete
 * files we own — if a country's flagImage is pointing at an external
 * URL (e.g. Wikimedia during seed) we return null and leave it alone.
 */
const extractBunnyPath = (cdnUrl: string | null): string | null => {
  if (!cdnUrl) return null;
  const base = env.BUNNY_CDN_URL.replace(/\/+$/, '');
  if (!cdnUrl.startsWith(base + '/')) return null;
  return cdnUrl.slice(base.length + 1); // strip "<base>/"
};

/**
 * Best-effort delete: never throws, never blocks the caller. A non-OK
 * response (including 404 for already-gone objects) is logged at WARN
 * and swallowed so the caller can proceed with the new upload.
 */
const safeDeleteFromBunny = async (path: string, countryId: number): Promise<void> => {
  try {
    await bunnyStorageService.delete(path);
  } catch (err) {
    logger.warn(
      { err, path, countryId },
      'Country flag: pre-upload delete failed (object may not exist); continuing with new upload'
    );
  }
};

export const processCountryFlagUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<CountryDto> => {
  // 1. Country must exist and not be soft-deleted before we burn a
  //    Bunny round-trip on it.
  const existing = await getCountryById(id);
  if (!existing) {
    throw AppError.notFound(`Country ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(`Country ${id} is soft-deleted; restore it before uploading a flag`);
  }

  // 2. Decode and validate dimensions. sharp throws on garbage bytes,
  //    which we re-wrap as a 400 so the client sees a clean envelope.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(file.buffer).metadata();
  } catch (err) {
    logger.warn({ err, countryId: id }, 'Country flag: sharp failed to read metadata');
    throw AppError.badRequest('Uploaded file is not a readable image');
  }

  if (metadata.width !== FLAG_REQUIRED_WIDTH || metadata.height !== FLAG_REQUIRED_HEIGHT) {
    throw AppError.badRequest(
      `Flag image must be exactly ${FLAG_REQUIRED_WIDTH}x${FLAG_REQUIRED_HEIGHT} pixels`,
      { receivedWidth: metadata.width ?? null, receivedHeight: metadata.height ?? null }
    );
  }

  // 3. Re-encode to WebP. quality 90 keeps a 90×90 flag well under
  //    25 KB even for the busiest national emblems.
  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(file.buffer).webp({ quality: 90 }).toBuffer();
  } catch (err) {
    logger.error({ err, countryId: id }, 'Country flag: sharp WebP encode failed');
    throw AppError.internal('Failed to convert flag image to WebP');
  }

  // 4. Compute the target key (ISO3-based, e.g. `countries/flags/ind.webp`)
  //    and the set of prior keys to evict before the new PUT.
  const targetPath = `countries/flags/${existing.iso3.toLowerCase()}.webp`;
  const legacyIso2Path = `countries/flags/${existing.iso2.toLowerCase()}.webp`;
  const priorPathFromUrl = extractBunnyPath(existing.flagImage);

  const pathsToDelete = new Set<string>();
  pathsToDelete.add(targetPath);
  if (legacyIso2Path !== targetPath) {
    pathsToDelete.add(legacyIso2Path);
  }
  if (priorPathFromUrl) {
    pathsToDelete.add(priorPathFromUrl);
  }

  // 5. Delete prior flag(s). Best-effort, sequential (there are at most
  //    3 paths so a Promise.all buys us nothing and makes the logs harder
  //    to read).
  for (const p of pathsToDelete) {
    await safeDeleteFromBunny(p, id);
  }

  // 6. Upload the new WebP to Bunny under the deterministic ISO3 key.
  const { cdnUrl } = await bunnyStorageService.upload({
    buffer: webpBuffer,
    targetPath,
    contentType: 'image/webp'
  });

  // 7. Persist the URL via the internal-only flag-image setter.
  //    PATCH /countries/:id cannot touch this column anymore, so the
  //    upload endpoint is the single source of truth for flag changes.
  await setCountryFlagImage(id, cdnUrl, callerId);

  // 8. Return the refreshed row so the client can render it
  //    immediately without a follow-up GET.
  const refreshed = await getCountryById(id);
  if (!refreshed) {
    // Effectively unreachable, but keeps the return type honest.
    throw AppError.internal('Country disappeared after flag upload');
  }
  return refreshed;
};
