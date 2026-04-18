import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

/**
 * GET /table-summary
 * Returns all table summaries or a single one by ?table_name=countries
 */
export async function list(req: Request, res: Response) {
  const tableName = req.query.table_name as string | undefined;

  let q = supabase.from('table_summary').select('*');

  if (tableName) {
    q = q.eq('table_name', tableName);
  }

  q = q.order('table_name', { ascending: true });

  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

/**
 * POST /table-summary/sync
 * Triggers a full sync of all table summaries
 */
export async function syncAll(req: Request, res: Response) {
  const { data, error: e } = await supabase.rpc('udf_sync_all_table_summaries');
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'All table summaries synced');
}

/**
 * POST /table-summary/sync/:tableName
 * Triggers sync for a single table
 */
export async function syncOne(req: Request, res: Response) {
  const { data, error: e } = await supabase.rpc('udf_sync_table_summary', {
    p_table_name: req.params.tableName,
  });
  if (e) return err(res, e.message, 500);
  return ok(res, data, `Table summary synced for ${req.params.tableName}`);
}
