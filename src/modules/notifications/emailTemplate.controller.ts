import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'email_templates';
const CACHE_KEY = 'email_templates:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['brevo_template_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // JSON fields
  if (typeof body.variables === 'string') {
    try { body.variables = JSON.parse(body.variables); } catch { body.variables = []; }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

    let q = supabase.from(TABLE).select('*', { count: 'exact' });

    if (search) q = applySearch(q, search, { ilike: ['template_key', 'template_name', 'subject'] });
    if (req.query.notification_type) q = q.eq('notification_type', String(req.query.notification_type));
    if (req.query.is_active === 'true') q = q.eq('is_active', true);
    if (req.query.is_active === 'false') q = q.eq('is_active', false);

    if (req.query.show_deleted === 'true') {
      q = q.not('deleted_at', 'is', null);
    } else {
      q = q.is('deleted_at', null);
    }

    q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
    if (e || !data) return err(res, 'Email template not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.template_key) return err(res, 'template_key is required', 400);
    if (!body.template_name) return err(res, 'template_name is required', 400);

    // Check unique template_key
    const { data: existing } = await supabase.from(TABLE).select('id').eq('template_key', body.template_key).is('deleted_at', null).maybeSingle();
    if (existing) return err(res, `Template key "${body.template_key}" already exists`, 409);

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'email_template_created', targetType: 'email_template', targetId: data.id, targetName: data.template_name, ip: getClientIp(req) });
    return ok(res, data, 'Email template created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id as string);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Email template not found', 404);

    const updates = parseBody(req);

    // If template_key changed, check uniqueness
    if (updates.template_key && updates.template_key !== old.template_key) {
      const { data: dup } = await supabase.from(TABLE).select('id').eq('template_key', updates.template_key).is('deleted_at', null).neq('id', id).maybeSingle();
      if (dup) return err(res, `Template key "${updates.template_key}" already exists`, 409);
    }

    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'email_template_updated', targetType: 'email_template', targetId: id, targetName: data.template_name, ip: getClientIp(req) });
    return ok(res, data, 'Email template updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id as string);
    const { data: old } = await supabase.from(TABLE).select('template_name, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Email template not found', 404);
    if (old.deleted_at) return err(res, 'Already in trash', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'email_template_soft_deleted', targetType: 'email_template', targetId: id, targetName: old.template_name, ip: getClientIp(req) });
    return ok(res, data, 'Email template moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id as string);
    const { data: old } = await supabase.from(TABLE).select('template_name, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Email template not found', 404);
    if (!old.deleted_at) return err(res, 'Not in trash', 400);

    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'email_template_restored', targetType: 'email_template', targetId: id, targetName: old.template_name, ip: getClientIp(req) });
    return ok(res, data, 'Email template restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id as string);
    const { data: old } = await supabase.from(TABLE).select('template_name').eq('id', id).single();
    if (!old) return err(res, 'Email template not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'email_template_deleted', targetType: 'email_template', targetId: id, targetName: old.template_name, ip: getClientIp(req) });
    return ok(res, null, 'Email template permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function summary(_req: Request, res: Response) {
  try {
    const { data: active } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null);
    const { data: inactive } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_active', false).is('deleted_at', null);
    const { data: deleted } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null);

    // Use count from response headers
    const { count: activeCount } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null);
    const { count: inactiveCount } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_active', false).is('deleted_at', null);
    const { count: deletedCount } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null);

    const a = activeCount || 0;
    const i = inactiveCount || 0;
    const d = deletedCount || 0;

    return ok(res, [{ table_name: TABLE, is_active: a, is_inactive: i, is_deleted: d, total: a + i + d }]);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
