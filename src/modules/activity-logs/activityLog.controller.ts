import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';

/**
 * Activity-log queries. Each table has a slightly different actor column
 * (auth → user_id, admin/data → actor_id, system → user_id). After the
 * page of rows is fetched we batch-look-up the users so the response
 * carries `actor: { id, first_name, last_name, email, mobile }` ready to
 * render in admin dashboards and the Activity Logs list page.
 */
async function queryLog(table: string, req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;

  const actorCol = table === 'auth_activity_log' || table === 'system_activity_log' ? 'user_id' : 'actor_id';

  let q = supabase.from(table).select('*', { count: 'exact' });
  if (req.query.action)  q = q.ilike('action', `%${String(req.query.action).replace(/[%_,()]/g, '')}%`);
  if (req.query.user_id) q = q.eq(actorCol, req.query.user_id);
  if (req.query.from)    q = q.gte('created_at', req.query.from);
  if (req.query.to)      q = q.lte('created_at', req.query.to);

  // Phase 14.11 — free-text search across action + identifier + target_name.
  const search = (req.query.search as string | undefined)?.trim();
  if (search) {
    const safe = search.replace(/[%_,()]/g, '');
    const cols = ['action.ilike.%' + safe + '%'];
    if (table === 'auth_activity_log') cols.push('identifier.ilike.%' + safe + '%');
    if (table === 'admin_activity_log' || table === 'data_activity_log') {
      cols.push('target_name.ilike.%' + safe + '%', 'target_type.ilike.%' + safe + '%');
    }
    if (table === 'system_activity_log') {
      cols.push('message.ilike.%' + safe + '%', 'source.ilike.%' + safe + '%');
    }
    q = q.or(cols.join(','));
  }

  const { data: rows, count, error: e } = await q.range(offset, offset + limit - 1).order('created_at', { ascending: false });
  if (e) return err(res, e.message, 500);

  // ── Batch-fetch the actors ────────────────────────────────────
  const ids = Array.from(new Set((rows ?? []).map((r: any) => r[actorCol]).filter((v) => v != null)));
  let actorsById = new Map<number, any>();
  if (ids.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, full_name, email, mobile, avatar_url')
      .in('id', ids);
    actorsById = new Map((users ?? []).map((u: any) => [Number(u.id), u]));
  }

  const enriched = (rows ?? []).map((r: any) => {
    const u = r[actorCol] ? actorsById.get(Number(r[actorCol])) : null;
    return {
      ...r,
      actor: u ? {
        id:         u.id,
        first_name: u.first_name,
        last_name:  u.last_name,
        full_name:  u.full_name ?? [u.first_name, u.last_name].filter(Boolean).join(' '),
        email:      u.email,
        mobile:     u.mobile,
        avatar_url: u.avatar_url,
      } : null,
    };
  });

  return paginated(res, enriched, count || 0, page, limit);
}

export const authLogs   = (req: Request, res: Response) => queryLog('auth_activity_log', req, res);
export const adminLogs  = (req: Request, res: Response) => queryLog('admin_activity_log', req, res);
export const dataLogs   = (req: Request, res: Response) => queryLog('data_activity_log', req, res);
export const systemLogs = (req: Request, res: Response) => queryLog('system_activity_log', req, res);

// Distinct action values for a log type — powers the admin "action" filter dropdown.
export async function logActions(req: Request, res: Response) {
  const map: Record<string, string> = {
    auth: 'auth_activity_log', admin: 'admin_activity_log', data: 'data_activity_log', system: 'system_activity_log',
  };
  const table = map[String(req.params.type)];
  if (!table) return err(res, 'Invalid log type', 400);
  const { data, error: e } = await supabase.from(table).select('action').not('action', 'is', null).limit(5000);
  if (e) return err(res, e.message, 500);
  const actions = Array.from(new Set((data ?? []).map((r: any) => r.action).filter(Boolean))).sort();
  return ok(res, actions);
}
