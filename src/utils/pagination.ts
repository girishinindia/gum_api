import { Request } from 'express';

export interface ListParams {
  page: number;
  limit: number;
  offset: number;
  search?: string;
  sort: string;
  ascending: boolean;
}

/**
 * Parse common list query params: ?page=1&limit=20&search=foo&sort=name&order=desc
 *
 * Defaults:
 *   • `limit` — fallback when the client omits `?limit=`. Defaults to 20.
 *   • `maxLimit` — hard ceiling on `limit`. Defaults to 100, which is a
 *     safe default for user-facing list tables. Reference-data lookups
 *     (countries / states / cities / social_medias) that need to populate
 *     dropdowns in one shot should pass a higher cap, e.g. `maxLimit: 2000`
 *     for cities (Tamil Nadu has ~900 active cities).
 *   • `sort` — fallback sort column.
 */
export function parseListParams(
  req: Request,
  defaults: { sort?: string; limit?: number; maxLimit?: number } = {},
): ListParams {
  const cap = defaults.maxLimit ?? 100;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(cap, Math.max(1, parseInt(req.query.limit as string) || defaults.limit || 20));
  const search = (req.query.search as string)?.trim() || undefined;
  const sort = (req.query.sort as string) || defaults.sort || 'name';
  const ascending = req.query.ascending !== undefined
    ? String(req.query.ascending) === 'true'
    : (req.query.order as string) !== 'desc'; // BUG-25: some admin pages send ?ascending=
  return { page, limit, offset: (page - 1) * limit, search, sort, ascending };
}
