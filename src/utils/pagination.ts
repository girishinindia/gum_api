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
 */
export function parseListParams(req: Request, defaults: { sort?: string; limit?: number } = {}): ListParams {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || defaults.limit || 20));
  const search = (req.query.search as string)?.trim() || undefined;
  const sort = (req.query.sort as string) || defaults.sort || 'name';
  const ascending = (req.query.order as string) !== 'desc';
  return { page, limit, offset: (page - 1) * limit, search, sort, ascending };
}
