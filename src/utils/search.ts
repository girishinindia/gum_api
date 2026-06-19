// We use a generic approach rather than importing PostgrestFilterBuilder
// directly, because the generic signature varies across @supabase/postgrest-js versions.

/**
 * Full-Text Search Utility
 * ────────────────────────
 * Provides a unified way to add search filtering to Supabase queries.
 * Supports three modes:
 *
 *   1. tsvector  — Uses existing search_vector columns with plainto_tsquery.
 *                  Fastest. Used for translation tables that already have
 *                  auto-generated tsvector columns with GIN indexes.
 *
 *   2. ilike     — Standard PostgREST ILIKE filtering with pg_trgm GIN
 *                  index acceleration. The trgm indexes we added make these
 *                  ILIKE queries use index scans instead of seq scans.
 *                  This is the recommended mode for most tables.
 *
 *   3. tsvector+ilike — Combines tsvector on the search_vector column
 *                  with ILIKE fallback on additional columns.
 *
 * Usage:
 *   import { applySearch } from '../utils/search';
 *
 *   // Simple ILIKE (most common — trgm indexes accelerate this automatically)
 *   if (search) q = applySearch(q, search, { ilike: ['name', 'code', 'slug'] });
 *
 *   // tsvector on translation tables
 *   if (search) q = applySearch(q, search, { tsvector: 'search_vector' });
 *
 *   // Combined: tsvector + ilike fallback columns
 *   if (search) q = applySearch(q, search, {
 *     tsvector: 'search_vector',
 *     ilike: ['slug', 'code'],  // columns not in the tsvector
 *   });
 */

export interface SearchConfig {
  /** Column name of the tsvector field (e.g. 'search_vector') */
  tsvector?: string;
  /** tsconfig to use (default: 'simple') */
  tsconfig?: string;
  /** Columns to search with ILIKE (accelerated by pg_trgm GIN indexes) */
  ilike?: string[];
}

/**
 * Sanitize a search term for safe use in PostgREST filters.
 * Escapes special characters that could break filter syntax.
 */
function sanitize(term: string): string {
  // Remove PostgREST filter operators and special chars
  return term
    .replace(/[%_\\]/g, '')  // remove LIKE wildcards
    .replace(/[(),]/g, '')   // remove PostgREST syntax chars
    .trim();
}

/**
 * Sanitize a search term for use in tsquery.
 * Removes characters that could break plainto_tsquery parsing.
 */
function sanitizeTsquery(term: string): string {
  return term
    .replace(/[!&|():*'"\\<>]/g, '') // remove tsquery operators
    .trim();
}

/**
 * Apply search filtering to a Supabase query builder.
 *
 * @param query  - The Supabase query builder (after .select())
 * @param search - The raw search term from the user
 * @param config - Search configuration specifying which mode(s) to use
 * @returns The modified query with search filters applied
 */
export function applySearch<T extends { or: Function; textSearch: Function }>(
  query: T,
  search: string,
  config: SearchConfig,
): T {
  const term = sanitize(search);
  if (!term) return query;

  const hasTsvector = !!config.tsvector;
  const hasIlike = config.ilike && config.ilike.length > 0;

  // Mode 1: tsvector only
  if (hasTsvector && !hasIlike) {
    const tsTerm = sanitizeTsquery(search);
    if (!tsTerm) return query;
    return query.textSearch(
      config.tsvector!,
      tsTerm,
      { type: 'plain', config: config.tsconfig || 'simple' },
    ) as T;
  }

  // Mode 2: ILIKE only (most common — trgm GIN indexes make this fast)
  if (!hasTsvector && hasIlike) {
    const orFilter = config.ilike!
      .map(col => `${col}.ilike.%${term}%`)
      .join(',');
    return query.or(orFilter) as T;
  }

  // Mode 3: tsvector + ilike combined
  // Use .or() with both textSearch and ilike conditions
  if (hasTsvector && hasIlike) {
    const tsTerm = sanitizeTsquery(search);
    const ilikeFilters = config.ilike!
      .map(col => `${col}.ilike.%${term}%`)
      .join(',');

    if (tsTerm) {
      // Combine: search_vector match OR any ilike column match
      const tsFilter = `${config.tsvector!}.plfts(${config.tsconfig || 'simple'}).${tsTerm}`;
      return query.or(`${tsFilter},${ilikeFilters}`) as T;
    } else {
      // tsquery term was empty after sanitization, use ilike only
      return query.or(ilikeFilters) as T;
    }
  }

  // No config specified — return unmodified
  return query;
}

/**
 * Pre-built search configs for tables that appear frequently.
 * Controllers can import and use these directly:
 *
 *   import { SEARCH_CONFIGS } from '../utils/search';
 *   if (search) q = applySearch(q, search, SEARCH_CONFIGS.courses);
 */
export const SEARCH_CONFIGS: Record<string, SearchConfig> = {
  // ── Tables with existing tsvector + GIN ──
  course_translations:       { tsvector: 'search_vector' },
  category_translations:     { tsvector: 'search_vector' },
  sub_category_translations: { tsvector: 'search_vector' },
  sub_topic_translations:    { tsvector: 'search_vector' },
  assessment_translations:   { tsvector: 'search_vector' },
  batch_translations:        { tsvector: 'search_vector' },
  course_module_translations:{ tsvector: 'search_vector' },
  webinar_translations:      { tsvector: 'search_vector' },

  // ── Tables with new trgm GIN indexes ──
  courses:          { ilike: ['code', 'slug', 'name'] },
  users:            { ilike: ['full_name', 'email', 'mobile'] },
  blog_posts:       { ilike: ['title', 'excerpt', 'content'] },
  support_tickets:  { ilike: ['subject', 'ticket_number', 'description'] },
  invoices:         { ilike: ['invoice_number', 'billing_name', 'billing_email', 'notes'] },
  transactions:     { ilike: ['transaction_number', 'description', 'notes'] },
  chat_messages:    { ilike: ['content'] },
  chat_rooms:       { ilike: ['name', 'description', 'invite_code'] },
  coupons:          { ilike: ['coupon_code'] },
  bundles:          { ilike: ['code', 'slug', 'name'] },
  chapters:         { ilike: ['slug'] },
  topics:           { ilike: ['slug'] },
  sub_topics:       { ilike: ['slug'] },
  enrollments:      { ilike: ['notes'] },
  departments:      { ilike: ['name', 'code', 'description'] },
  countries:        { ilike: ['name', 'iso2', 'iso3', 'nationality'] },
};

// ════════════════════════════════════════════════════════════════════════
// Translation-aware search
// ────────────────────────────────────────────────────────────────────────
// Many catalog entities keep their human-readable name ONLY in a
// `*_translations` table (the base row has just code/slug). Base-table ILIKE
// therefore never matches when an admin types the visible (translated) name.
// These helpers fetch the base IDs whose translation name/title matches, so a
// list query can OR them in alongside the normal base-column search — covering
// English AND every localized language (Hindi/Gujarati/Marathi).
// ════════════════════════════════════════════════════════════════════════

/**
 * Return base-entity IDs whose translation row matches `search` on any of
 * `cols` (ILIKE). All `*_translations` tables carry `deleted_at`, so
 * soft-deleted rows are excluded unless `includeDeleted` is set.
 */
export async function matchTranslationIds(
  client: { from: Function },
  table: string,
  fk: string,
  cols: string[],
  search: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<number[]> {
  const term = sanitize(search);
  if (!term || cols.length === 0) return [];
  let q = client
    .from(table)
    .select(fk)
    .or(cols.map((c) => `${c}.ilike.%${term}%`).join(','));
  if (!opts.includeDeleted) q = q.is('deleted_at', null);
  const { data } = await q.limit(2000);
  if (!data) return [];
  const ids = [...new Set((data as any[]).map((r) => r[fk]).filter((v) => v != null))] as number[];
  return ids.slice(0, 1000); // cap so the id.in.(…) filter can't blow the URL length
}

/**
 * Translation-aware list search: ORs the base-column ILIKE matches with
 * `id.in.(…)` for rows whose translation matched. With no translation config
 * (or no translated match) it behaves like the plain base ILIKE search.
 * Async — it may hit the DB for the translation lookup, so callers `await`.
 */
export async function applyTranslatedSearch<T extends { or: Function }>(
  query: T,
  client: { from: Function },
  opts: {
    search: string;
    base: string[];
    translation?: { table: string; fk: string; cols: string[] };
    includeDeleted?: boolean;
  },
// Returns `{ query }` (NOT the bare builder) because a PostgREST builder is
// itself thenable — returning it from an async fn and `await`ing would execute
// the query and yield the response instead of the chainable builder. Callers
// do: `q = (await applyTranslatedSearch(...)).query;`
): Promise<{ query: T }> {
  const term = sanitize(opts.search);
  if (!term) return { query };
  const clauses = opts.base.map((c) => `${c}.ilike.%${term}%`);
  if (opts.translation) {
    const ids = await matchTranslationIds(
      client, opts.translation.table, opts.translation.fk, opts.translation.cols,
      opts.search, { includeDeleted: opts.includeDeleted },
    );
    if (ids.length) clauses.push(`id.in.(${ids.join(',')})`);
  }
  return { query: query.or(clauses.join(',')) as T };
}
