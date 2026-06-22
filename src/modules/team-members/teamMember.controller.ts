import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { revalidateWeb } from '../../utils/revalidate';

const TABLE = 'team_members';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

// Only http(s) URLs live on the CDN. Seeded members use static /images/team/*.jpg
// paths served by gum_web — never try to delete those from Bunny.
function isCdnUrl(url?: string | null): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /team-members  (public — the website reads this)
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (search) {
    const term = String(search).replace(/[%_\\(),]/g, '');
    if (term) q = q.or(`name.ilike.%${term}%,role.ilike.%${term}%`);
  }

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  if (req.query.section) q = q.eq('section', req.query.section);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /team-members/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Team member not found', 404);
  return ok(res, data);
}

// POST /team-members
export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  if (!body.name) return err(res, 'Name is required', 400);

  if (body.is_active === false && !hasPermission(req, 'team_member', 'activate')) {
    return err(res, 'Permission denied: team_member:activate required to create inactive member', 403);
  }

  // 'image' is the upload field, never a real column.
  const removeImage = body.image === null;
  delete body.image;

  let uploadedUrl: string | null = null;
  if (req.file) {
    const slug = (body.name || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    uploadedUrl = await processAndUploadImage(req.file.buffer, `team/${slug}-${Date.now()}.webp`, { width: 600, height: 600, quality: 85 });
    body.image_url = uploadedUrl;
  } else if (removeImage) {
    body.image_url = null;
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select().single();
  if (e) {
    if (uploadedUrl) { try { await deleteImage(extractBunnyPath(uploadedUrl), uploadedUrl); } catch {} }
    return err(res, e.message, 500);
  }
  revalidateWeb('team-member:create');
  return ok(res, data, 'Team member created', 201);
}

// PATCH /team-members/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Team member not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'team_member', 'activate')) {
      return err(res, 'Permission denied: team_member:activate required to change active status', 403);
    }
  }

  const removeImage = updates.image === null;
  delete updates.image;

  if (req.file) {
    const slug = (updates.name || old.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    updates.image_url = await processAndUploadImage(req.file.buffer, `team/${slug}-${Date.now()}.webp`, { width: 600, height: 600, quality: 85 });
    if (isCdnUrl(old.image_url)) { try { await deleteImage(extractBunnyPath(old.image_url), old.image_url); } catch {} }
  } else if (removeImage) {
    updates.image_url = null;
    if (isCdnUrl(old.image_url)) { try { await deleteImage(extractBunnyPath(old.image_url), old.image_url); } catch {} }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  revalidateWeb('team-member:update');
  return ok(res, data, 'Team member updated');
}

// DELETE /team-members/:id  (soft delete → trash)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Team member not found', 404);
  if (old.deleted_at) return err(res, 'Team member is already in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  revalidateWeb('team-member:delete');
  return ok(res, data, 'Team member moved to trash');
}

// PATCH /team-members/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Team member not found', 404);
  if (!old.deleted_at) return err(res, 'Team member is not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  revalidateWeb('team-member:restore');
  return ok(res, data, 'Team member restored');
}

// DELETE /team-members/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, image_url').eq('id', id).single();
  if (!old) return err(res, 'Team member not found', 404);

  if (isCdnUrl(old.image_url)) { try { await deleteImage(extractBunnyPath(old.image_url), old.image_url); } catch {} }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  revalidateWeb('team-member:purge');
  return ok(res, null, 'Team member permanently deleted');
}
