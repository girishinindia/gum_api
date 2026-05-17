import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'policies';
const CACHE_KEY = 'policies:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

const FK_SELECT = `*, policy_types!policies_policy_type_id_fkey(id, name, code), users!policies_created_by_fkey(id, first_name, last_name, email)`;

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_current === 'string') body.is_current = body.is_current === 'true';
  for (const k of ['policy_type_id', 'created_by']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// -- LIST --
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['title', 'slug', 'version'] });
  if (req.query.policy_type_id) q = q.eq('policy_type_id', parseInt(req.query.policy_type_id as string));
  if (req.query.policy_status) q = q.eq('policy_status', req.query.policy_status as string);
  if (req.query.is_current === 'true') q = q.eq('is_current', true);
  else if (req.query.is_current === 'false') q = q.eq('is_current', false);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// -- GET BY ID --
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Policy not found', 404);
  return ok(res, data);
}

// -- CREATE --
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_created', targetType: 'policy', targetId: data.id, targetName: body.title, ip: getClientIp(req) });
  return ok(res, data, 'Policy created', 201);
}

// -- UPDATE --
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Policy not found', 404);

  const updates = parseBody(req);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_updated', targetType: 'policy', targetId: id, targetName: updates.title || old.title, ip: getClientIp(req) });
  return ok(res, data, 'Policy updated');
}

// -- SOFT DELETE --
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Policy not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_soft_deleted', targetType: 'policy', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Policy moved to trash');
}

// -- RESTORE --
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Policy not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_restored', targetType: 'policy', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Policy restored');
}

// -- PERMANENT DELETE --
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Policy not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_deleted', targetType: 'policy', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Policy permanently deleted');
}

// -- PUBLISH --
export async function publish(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: policy } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!policy) return err(res, 'Policy not found', 404);
  if (policy.policy_status !== 'draft') return err(res, 'Only draft policies can be published', 400);

  const now = new Date().toISOString();

  // Find any existing current policy for the same type and archive it
  const { data: currentPolicy } = await supabase
    .from(TABLE)
    .select('id')
    .eq('policy_type_id', policy.policy_type_id)
    .eq('is_current', true)
    .neq('id', id)
    .single();

  if (currentPolicy) {
    await supabase
      .from(TABLE)
      .update({ is_current: false, policy_status: 'archived' })
      .eq('id', currentPolicy.id);
  }

  // Publish this policy
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ policy_status: 'published', published_at: now, is_current: true })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_published', targetType: 'policy', targetId: id, targetName: policy.title, ip: getClientIp(req) });
  return ok(res, data, 'Policy published');
}

// -- ARCHIVE --
export async function archive(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: policy } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!policy) return err(res, 'Policy not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ policy_status: 'archived', is_current: false })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'policy_archived', targetType: 'policy', targetId: id, targetName: policy.title, ip: getClientIp(req) });
  return ok(res, data, 'Policy archived');
}
