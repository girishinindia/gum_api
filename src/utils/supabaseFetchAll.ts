import { supabase } from '../config/supabase';

/**
 * Fetch ALL rows from a Supabase table, paginating in chunks to avoid the 1000-row default limit.
 *
 * Usage:
 *   const data = await fetchAll('sub_topic_translations', 'sub_topic_id, language_id, page', {
 *     filters: q => q.is('deleted_at', null),
 *   });
 *
 * @param table - The table name
 * @param select - The columns to select
 * @param options.filters - A function that adds filters to the query builder
 * @param options.order - Optional column to order by (default: 'id')
 * @param options.chunkSize - Rows per page (default: 1000)
 * @returns All matching rows
 */
export async function fetchAll<T = any>(
  table: string,
  select: string,
  options?: {
    filters?: (q: any) => any;
    order?: string;
    ascending?: boolean;
    chunkSize?: number;
  },
): Promise<T[]> {
  const chunkSize = options?.chunkSize || 1000;
  const orderCol = options?.order || 'id';
  const ascending = options?.ascending !== false;
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    let q = supabase.from(table).select(select);
    if (options?.filters) q = options.filters(q);
    q = q.order(orderCol, { ascending }).range(offset, offset + chunkSize - 1);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...(data as T[]));
    if (data.length < chunkSize) break; // Last page
    offset += chunkSize;
  }

  return allRows;
}
