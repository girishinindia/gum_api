import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { hasPermission } from '../../middleware/rbac';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { generateUniqueSlug } from '../../utils/helpers';

const TABLE = 'job_positions';

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── GET /job-positions  (PUBLIC) — only active, not expired, not deleted ──
export async function publicList(_req: Request, res: Response) {
  const nowIso = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .select('id, title, slug, department, location, employment_type, experience, description, requirements, skills, salary_range, expires_at, display_order, created_at')
    .eq('is_active', true)
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── GET /job-positions/slug/:slug  (PUBLIC) — single active, non-expired ──
export async function publicBySlug(req: Request, res: Response) {
  const nowIso = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .select('id, title, slug, department, location, employment_type, experience, description, requirements, skills, salary_range, expires_at, created_at')
    .eq('slug', req.params.slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
    .maybeSingle();
  if (e) return err(res, e.message, 500);
  if (!data) return err(res, 'Position not found or no longer open', 404);
  return ok(res, data);
}

// ── GET /job-positions/admin  (admin) — full list with filters ──
export async function adminList(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (search) {
    const t = String(search).replace(/[%_\\(),]/g, '');
    if (t) q = q.or(`title.ilike.%${t}%,department.ilike.%${t}%,location.ilike.%${t}%`);
  }
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (req.query.employment_type) q = q.eq('employment_type', req.query.employment_type);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Expiry filter (admin can show only-expired or only-current)
  const nowIso = new Date().toISOString();
  if (req.query.expiry === 'expired') q = q.not('expires_at', 'is', null).lt('expires_at', nowIso);
  else if (req.query.expiry === 'active') q = q.or(`expires_at.is.null,expires_at.gte.${nowIso}`);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /job-positions/:id  (admin) ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Position not found', 404);
  return ok(res, data);
}

// ── POST /job-positions  (admin) ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.title) return err(res, 'Title is required', 400);
  if (!body.description) return err(res, 'Description is required', 400);

  if (body.is_active === false && !hasPermission(req, 'job_position', 'activate')) {
    return err(res, 'Permission denied: job_position:activate required to create inactive position', 403);
  }

  body.slug = await generateUniqueSlug(supabase, TABLE, body.slug || body.title);
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'A position with this slug already exists', 409);
    return err(res, e.message, 500);
  }
  return ok(res, data, 'Position created', 201);
}

// ── PATCH /job-positions/:id  (admin) ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Position not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'job_position', 'activate')) {
      return err(res, 'Permission denied: job_position:activate required to change active status', 403);
    }
  }

  // Re-slug only if the slug was explicitly changed.
  if (updates.slug && updates.slug !== old.slug) {
    updates.slug = await generateUniqueSlug(supabase, TABLE, updates.slug);
  }
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'A position with this slug already exists', 409);
    return err(res, e.message, 500);
  }
  return ok(res, data, 'Position updated');
}

// ── DELETE /job-positions/:id  (admin, soft delete) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Position not found', 404);
  if (old.deleted_at) return err(res, 'Position is already in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Position moved to trash');
}

// ── PATCH /job-positions/:id/restore  (admin) ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Position not found', 404);
  if (!old.deleted_at) return err(res, 'Position is not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Position restored');
}

// ── DELETE /job-positions/:id/permanent  (admin) ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Position not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: applications reference this position', 409);
    return err(res, e.message, 500);
  }
  return ok(res, null, 'Position permanently deleted');
}
