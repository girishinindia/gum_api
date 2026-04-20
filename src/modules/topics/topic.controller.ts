import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'topics:all';
const clearCache = async (chapterId?: number) => {
  await redis.del(CACHE_KEY);
  if (chapterId) await redis.del(`topics:chapter:${chapterId}`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.chapter_id === 'string') {
    if (body.chapter_id === '' || body.chapter_id === 'null') {
      body.chapter_id = null;
    } else {
      body.chapter_id = parseInt(body.chapter_id) || null;
    }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('topics').select('*, chapters(slug, subject_id)', { count: 'exact' });

  // Search
  if (search) q = q.ilike('slug', `%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.chapter_id) q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('topics')
    .select('*, chapters(slug, subject_id)')
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'Topic not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'topic', 'activate')) {
    return err(res, 'Permission denied: topic:activate required to create inactive', 403);
  }

  // Verify chapter exists if chapter_id is provided
  if (body.chapter_id) {
    const { data: chapter } = await supabase.from('chapters').select('id').eq('id', body.chapter_id).single();
    if (!chapter) return err(res, 'Chapter not found', 404);
  }

  // Set audit field
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase
    .from('topics')
    .insert(body)
    .select('*, chapters(slug, subject_id)')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Topic slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.chapter_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'topic_created',
    targetType: 'topic',
    targetId: data.id,
    targetName: data.slug,
    ip: getClientIp(req),
  });
  return ok(res, data, 'Topic created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('topics').select('*').eq('id', id).single();
  if (!old) return err(res, 'Topic not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'topic', 'activate')) {
      return err(res, 'Permission denied: topic:activate required to change active status', 403);
    }
  }

  // If changing chapter, verify it exists
  if (updates.chapter_id && updates.chapter_id !== old.chapter_id) {
    const { data: chapter } = await supabase.from('chapters').select('id').eq('id', updates.chapter_id).single();
    if (!chapter) return err(res, 'Chapter not found', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('topics')
    .update(updates)
    .eq('id', id)
    .select('*, chapters(slug, subject_id)')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Topic slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.chapter_id);
  if (updates.chapter_id && updates.chapter_id !== old.chapter_id) await clearCache(updates.chapter_id);

  logAdmin({
    actorId: req.user!.id,
    action: 'topic_updated',
    targetType: 'topic',
    targetId: id,
    targetName: data.slug,
    changes,
    ip: getClientIp(req),
  });

  return ok(res, data, 'Topic updated');
}

// DELETE /topics/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('topics').select('slug, chapter_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Topic not found', 404);
  if (old.deleted_at) return err(res, 'Topic is already in trash', 400);

  const { data, error: e } = await supabase
    .from('topics')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.chapter_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'topic_soft_deleted',
    targetType: 'topic',
    targetId: id,
    targetName: old.slug,
    ip: getClientIp(req),
  });
  return ok(res, data, 'Topic moved to trash');
}

// PATCH /topics/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('topics').select('slug, chapter_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Topic not found', 404);
  if (!old.deleted_at) return err(res, 'Topic is not in trash', 400);

  const { data, error: e } = await supabase
    .from('topics')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.chapter_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'topic_restored',
    targetType: 'topic',
    targetId: id,
    targetName: old.slug,
    ip: getClientIp(req),
  });
  return ok(res, data, 'Topic restored');
}

// DELETE /topics/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('topics').select('slug, chapter_id').eq('id', id).single();
  if (!old) return err(res, 'Topic not found', 404);

  const { error: e } = await supabase.from('topics').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: translations still reference this topic', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.chapter_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'topic_deleted',
    targetType: 'topic',
    targetId: id,
    targetName: old.slug,
    ip: getClientIp(req),
  });

  return ok(res, null, 'Topic deleted');
}
