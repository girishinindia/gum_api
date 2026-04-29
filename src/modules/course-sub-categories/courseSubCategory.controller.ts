import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'course_sub_categories:all';
const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`course_sub_categories:course:${courseId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_primary === 'string') body.is_primary = body.is_primary === 'true';
  // Integers
  if (typeof body.course_id === 'string') body.course_id = parseInt(body.course_id) || null;
  if (typeof body.sub_category_id === 'string') body.sub_category_id = parseInt(body.sub_category_id) || null;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, courses(code, slug, name), sub_categories(code, slug, name, category_id, categories:category_id(name, code))';

// GET /course-sub-categories
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('course_sub_categories').select(SELECT_FIELDS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.course_id) q = q.eq('course_id', req.query.course_id);
  if (req.query.sub_category_id) q = q.eq('sub_category_id', req.query.sub_category_id);
  if (req.query.is_primary === 'true') q = q.eq('is_primary', true);
  else if (req.query.is_primary === 'false') q = q.eq('is_primary', false);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /course-sub-categories/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('course_sub_categories').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course sub-category link not found', 404);
  return ok(res, data);
}

// POST /course-sub-categories
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_sub_category', 'activate')) {
    return err(res, 'Permission denied: course_sub_category:activate required to create inactive', 403);
  }

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, name').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Verify sub-category exists
  const { data: subCat } = await supabase.from('sub_categories').select('id, code, name').eq('id', body.sub_category_id).single();
  if (!subCat) return err(res, 'Sub-category not found', 404);

  // Set audit field
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('course_sub_categories').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This sub-category is already assigned to this course', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_sub_category_created', targetType: 'course_sub_category', targetId: data.id, targetName: `${course.name || course.code} - ${subCat.name || subCat.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Course sub-category link created', 201);
}

// PATCH /course-sub-categories/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_sub_categories').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course sub-category link not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_sub_category', 'activate')) {
      return err(res, 'Permission denied: course_sub_category:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  if (updates.sub_category_id && updates.sub_category_id !== old.sub_category_id) {
    const { data: subCat } = await supabase.from('sub_categories').select('id').eq('id', updates.sub_category_id).single();
    if (!subCat) return err(res, 'Sub-category not found', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_sub_categories').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This sub-category is already assigned to this course', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.course_id);
  if (updates.course_id && updates.course_id !== old.course_id) await clearCache(updates.course_id);

  logAdmin({ actorId: req.user!.id, action: 'course_sub_category_updated', targetType: 'course_sub_category', targetId: id, targetName: `${data.courses?.name || data.courses?.code} - ${data.sub_categories?.name || data.sub_categories?.code}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course sub-category link updated');
}

// DELETE /course-sub-categories/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_sub_categories').select('course_id, deleted_at, courses(name, code), sub_categories(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Course sub-category link not found', 404);
  if (old.deleted_at) return err(res, 'Link is already in trash', 400);

  const { data, error: e } = await supabase
    .from('course_sub_categories')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_sub_category_soft_deleted', targetType: 'course_sub_category', targetId: id, targetName: `${(old.courses as any)?.name || (old.courses as any)?.code} - ${(old.sub_categories as any)?.name || (old.sub_categories as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Course sub-category link moved to trash');
}

// PATCH /course-sub-categories/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_sub_categories').select('course_id, deleted_at, courses(name, code), sub_categories(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Course sub-category link not found', 404);
  if (!old.deleted_at) return err(res, 'Link is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_sub_categories')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_sub_category_restored', targetType: 'course_sub_category', targetId: id, targetName: `${(old.courses as any)?.name || (old.courses as any)?.code} - ${(old.sub_categories as any)?.name || (old.sub_categories as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Course sub-category link restored');
}

// DELETE /course-sub-categories/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_sub_categories').select('course_id, courses(name, code), sub_categories(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Course sub-category link not found', 404);

  const { error: e } = await supabase.from('course_sub_categories').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_sub_category_deleted', targetType: 'course_sub_category', targetId: id, targetName: `${(old.courses as any)?.name || (old.courses as any)?.code} - ${(old.sub_categories as any)?.name || (old.sub_categories as any)?.code}`, ip: getClientIp(req) });
  return ok(res, null, 'Course sub-category link permanently deleted');
}
