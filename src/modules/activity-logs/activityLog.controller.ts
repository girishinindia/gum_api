import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';

async function queryLog(table: string, req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;
  let q = supabase.from(table).select('*', { count: 'exact' });
  if (req.query.action) q = q.eq('action', req.query.action);
  if (req.query.user_id) q = q.eq(table === 'auth_activity_log' ? 'user_id' : 'actor_id', req.query.user_id);
  if (req.query.from) q = q.gte('created_at', req.query.from);
  if (req.query.to) q = q.lte('created_at', req.query.to);
  const { data, count, error: e } = await q.range(offset, offset + limit - 1).order('created_at', { ascending: false });
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export const authLogs = (req: Request, res: Response) => queryLog('auth_activity_log', req, res);
export const adminLogs = (req: Request, res: Response) => queryLog('admin_activity_log', req, res);
export const dataLogs = (req: Request, res: Response) => queryLog('data_activity_log', req, res);
export const systemLogs = (req: Request, res: Response) => queryLog('system_activity_log', req, res);
