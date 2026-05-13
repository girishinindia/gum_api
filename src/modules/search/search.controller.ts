/**
 * Search Controller (Phase 11.5.3)
 * ────────────────────────────────
 * Public, unauthenticated, ranked-by-similarity search. Powered by the
 * fn_search_courses / fn_search_instructors Postgres functions, which use
 * the GIN trigram indexes from Phase 11.5.1.
 *
 * These endpoints intentionally do *not* take filter params — they are the
 * search-bar surface, not the catalogue listing surface. For filtered list
 * pages, use /courses or /instructor-profiles which already accept all the
 * usual filters via the standard list pattern.
 */

import { Request, Response } from 'express';
import { db, DbError } from '../../services/db';
import { ok, err } from '../../utils/response';
import { logger } from '../../utils/logger';
import { searchQuerySchema } from './search.schema';

/** GET /search/courses?q=...&limit=&offset= */
export async function searchCourses(req: Request, res: Response) {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);

  const { q, limit, offset } = parsed.data;

  try {
    const data = await db.callFn('fn_search_courses', { q, lim: limit ?? 25, ofs: offset ?? 0 });
    return ok(res, { q, results: data ?? [], count: data?.length ?? 0 });
  } catch (e) {
    logger.error({ err: e, q }, '[Search] fn_search_courses failed');
    return err(res, e instanceof DbError ? e.message : 'search failed', 500);
  }
}

/** GET /search/instructors?q=...&limit=&offset= */
export async function searchInstructors(req: Request, res: Response) {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);

  const { q, limit, offset } = parsed.data;

  try {
    const data = await db.callFn('fn_search_instructors', { q, lim: limit ?? 25, ofs: offset ?? 0 });
    return ok(res, { q, results: data ?? [], count: data?.length ?? 0 });
  } catch (e) {
    logger.error({ err: e, q }, '[Search] fn_search_instructors failed');
    return err(res, e instanceof DbError ? e.message : 'search failed', 500);
  }
}
