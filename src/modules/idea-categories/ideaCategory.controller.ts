import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';
import { toSlug } from '../../utils/helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABLE = 'idea_categories';
const ALLOWED = ['name', 'slug', 'description', 'icon', 'display_order', 'is_active'] as const;

function parseBody(req: Request): any {
  const b: any = {};
  for (const k of ALLOWED) if (req.body[k] !== undefined) b[k] = req.body[k];
  if (typeof b.display_order === 'string') b.display_order = parseInt(b.display_order) || 0;
  if (typeof b.is_active === 'string') b.is_active = b.is_active === 'true';
  return b;
}

// GET /idea-categories — public; ?include_inactive=true for admin screens
export async function list(req: Request, res: Response) {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 200);
    const offset = (page - 1) * limit;

    let q = supabase.from(TABLE).select('*', { count: 'exact' });
    if (req.query.include_deleted !== 'true') q = q.is('deleted_at', null); // admin Trash tab passes include_deleted=true
    if (req.query.include_inactive !== 'true') q = q.eq('is_active', true);
    q = q.order('display_order').order('name').range(offset, offset + limit - 1);

    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) { return err(res, e.message, 500); }
}

// BUG-81: GET /idea-categories/:id/usage — admin-only. Returns how many non-deleted
// ideas reference this category so the UI can warn before a permanent delete.
// Mirrors the count query used as the guard inside `remove`.
export async function usage(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { count, error: e } = await supabase
      .from('ideas')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
      .is('deleted_at', null);
    if (e) return err(res, e.message, 500);
    return ok(res, { ideas_using: count || 0 });
  } catch (e: any) { return err(res, e.message, 500); }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.name) return err(res, 'name is required', 400);
    if (!body.slug) body.slug = toSlug(body.name);

    const { data, error: e } = await supabase.from(TABLE).insert(body).select('*').single();
    if (e) return err(res, e.message.includes('duplicate') ? 'A category with this slug already exists' : e.message, e.message.includes('duplicate') ? 400 : 500);
    return ok(res, data, 'Category created', 201);
  } catch (e: any) { return err(res, e.message, 500); }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const body = parseBody(req);
    (body as any).updated_at = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).is('deleted_at', null).select('*').single();
    if (e || !data) return err(res, e?.message || 'Category not found', e ? 500 : 404);
    return ok(res, data, 'Category updated');
  } catch (e: any) { return err(res, e.message, 500); }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE)
      .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select('id').single();
    if (e || !data) return err(res, 'Category not found', 404);
    return ok(res, data, 'Category moved to trash');
  } catch (e: any) { return err(res, e.message, 500); }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE)
      .update({ deleted_at: null, is_active: true }).eq('id', id).select('*').single();
    if (e || !data) return err(res, 'Category not found', 404);
    return ok(res, data, 'Category restored');
  } catch (e: any) { return err(res, e.message, 500); }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { count } = await supabase.from('ideas').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if ((count || 0) > 0) return err(res, `Cannot permanently delete — ${count} idea(s) use this category. Trash it instead.`, 400);
    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);
    return ok(res, { id }, 'Category permanently deleted');
  } catch (e: any) { return err(res, e.message, 500); }
}
