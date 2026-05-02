import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'bundle_courses:all';
const clearCache = async (bundleId?: number) => {
  await redis.del(CACHE_KEY);
  if (bundleId) await redis.del(`bundle_courses:bundle:${bundleId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integers
  if (typeof body.bundle_id === 'string') body.bundle_id = parseInt(body.bundle_id) || null;
  if (typeof body.course_id === 'string') body.course_id = parseInt(body.course_id) || null;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, bundles(code, slug, name), courses(code, slug, name)';

// GET /bundle-courses
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('bundle_courses').select(SELECT_FIELDS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.bundle_id) q = q.eq('bundle_id', req.query.bundle_id);
  if (req.query.course_id) q = q.eq('course_id', req.query.course_id);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /bundle-courses/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('bundle_courses').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Bundle course link not found', 404);
  return ok(res, data);
}

// POST /bundle-courses
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'bundle_course', 'activate')) {
    return err(res, 'Permission denied: bundle_course:activate required to create inactive', 403);
  }

  // Verify bundle exists
  const { data: bundle } = await supabase.from('bundles').select('id, code, name').eq('id', body.bundle_id).single();
  if (!bundle) return err(res, 'Bundle not found', 404);

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, name').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Set audit field
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('bundle_courses').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This course is already assigned to this bundle', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.bundle_id);
  logAdmin({ actorId: req.user!.id, action: 'bundle_course_created', targetType: 'bundle_course', targetId: data.id, targetName: `${bundle.name || bundle.code} - ${course.name || course.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Bundle course link created', 201);
}

// PATCH /bundle-courses/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundle_courses').select('*').eq('id', id).single();
  if (!old) return err(res, 'Bundle course link not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'bundle_course', 'activate')) {
      return err(res, 'Permission denied: bundle_course:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.bundle_id && updates.bundle_id !== old.bundle_id) {
    const { data: bundle } = await supabase.from('bundles').select('id').eq('id', updates.bundle_id).single();
    if (!bundle) return err(res, 'Bundle not found', 404);
  }

  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('bundle_courses').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This course is already assigned to this bundle', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.bundle_id);
  if (updates.bundle_id && updates.bundle_id !== old.bundle_id) await clearCache(updates.bundle_id);

  logAdmin({ actorId: req.user!.id, action: 'bundle_course_updated', targetType: 'bundle_course', targetId: id, targetName: `${data.bundles?.name || data.bundles?.code} - ${data.courses?.name || data.courses?.code}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Bundle course link updated');
}

// DELETE /bundle-courses/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundle_courses').select('bundle_id, deleted_at, bundles(name, code), courses(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Bundle course link not found', 404);
  if (old.deleted_at) return err(res, 'Link is already in trash', 400);

  const { data, error: e } = await supabase
    .from('bundle_courses')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.bundle_id);
  logAdmin({ actorId: req.user!.id, action: 'bundle_course_soft_deleted', targetType: 'bundle_course', targetId: id, targetName: `${(old.bundles as any)?.name || (old.bundles as any)?.code} - ${(old.courses as any)?.name || (old.courses as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Bundle course link moved to trash');
}

// PATCH /bundle-courses/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundle_courses').select('bundle_id, deleted_at, bundles(name, code), courses(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Bundle course link not found', 404);
  if (!old.deleted_at) return err(res, 'Link is not in trash', 400);

  const { data, error: e } = await supabase
    .from('bundle_courses')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.bundle_id);
  logAdmin({ actorId: req.user!.id, action: 'bundle_course_restored', targetType: 'bundle_course', targetId: id, targetName: `${(old.bundles as any)?.name || (old.bundles as any)?.code} - ${(old.courses as any)?.name || (old.courses as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Bundle course link restored');
}

// DELETE /bundle-courses/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundle_courses').select('bundle_id, bundles(name, code), courses(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Bundle course link not found', 404);

  const { error: e } = await supabase.from('bundle_courses').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.bundle_id);
  logAdmin({ actorId: req.user!.id, action: 'bundle_course_deleted', targetType: 'bundle_course', targetId: id, targetName: `${(old.bundles as any)?.name || (old.bundles as any)?.code} - ${(old.courses as any)?.name || (old.courses as any)?.code}`, ip: getClientIp(req) });
  return ok(res, null, 'Bundle course link permanently deleted');
}
