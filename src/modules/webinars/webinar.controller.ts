import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';
import { validateOwnerInstructor } from '../../utils/ownerInstructor';
import crypto from 'crypto';

const TABLE = 'webinars';
const CACHE_KEY = 'webinars:all';

const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`webinars:course:${courseId}`);
};

/* ─── helpers ─── */

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_free === 'string') body.is_free = body.is_free === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['course_id', 'chapter_id', 'instructor_id', 'max_attendees', 'registered_count', 'display_order', 'duration_minutes']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Numeric fields
  if (typeof body.price === 'string') body.price = parseFloat(body.price) || 0;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

/** Slugify a title into a URL-safe string */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars
    .replace(/[\s_]+/g, '-')    // spaces/underscores → hyphens
    .replace(/-+/g, '-')        // collapse consecutive hyphens
    .replace(/^-|-$/g, '');     // trim leading/trailing hyphens
}

/** Generate a short random alphanumeric string */
function shortId(len = 4): string {
  return crypto.randomBytes(len).toString('base64url').slice(0, len).toLowerCase();
}

/** Auto-generate a unique code: WEB-YYMMDD-XXXX */
async function generateUniqueCode(): Promise<string> {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const prefix = `WEB-${yy}${mm}${dd}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `${prefix}-${shortId(4).toUpperCase()}`;
    const { data } = await supabase.from(TABLE).select('id').eq('code', code).maybeSingle();
    if (!data) return code;
  }
  // Fallback — extremely unlikely
  return `${prefix}-${shortId(8).toUpperCase()}`;
}

/** Auto-generate a unique slug from the title */
async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title || 'webinar') || 'webinar';
  // Try base slug first
  const { data: existing } = await supabase.from(TABLE).select('id').eq('slug', base).maybeSingle();
  if (!existing) return base;
  // Append random suffix until unique
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = `${base}-${shortId(4)}`;
    const { data } = await supabase.from(TABLE).select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${shortId(8)}`;
}

/** Validate fields shared by create & update */
function validateFields(body: any): string | null {
  // Price
  if (body.price != null && body.price < 0) return 'Price cannot be negative';
  // Max attendees
  if (body.max_attendees != null && body.max_attendees < 1) return 'Max attendees must be at least 1';
  // Duration
  if (body.duration_minutes != null && body.duration_minutes < 1) return 'Duration must be at least 1 minute';
  // URL validation
  const urlPattern = /^https?:\/\/.+/;
  if (body.meeting_url && !urlPattern.test(body.meeting_url)) return 'Meeting URL must start with http:// or https://';
  if (body.recording_url && !urlPattern.test(body.recording_url)) return 'Recording URL must start with http:// or https://';
  return null;
}

const FK_SELECT = `*, courses(name, slug), users!webinars_instructor_id_fkey(id, full_name, email)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['title', 'code'] });
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.chapter_id) q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  if (req.query.webinar_status) q = q.eq('webinar_status', req.query.webinar_status as string);
  if (req.query.webinar_owner) q = q.eq('webinar_owner', req.query.webinar_owner as string);
  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.is_free === 'true') q = q.eq('is_free', true);
  else if (req.query.is_free === 'false') q = q.eq('is_free', false);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch translated title + description for the requested language
  const webinarIds = (data || []).map((w: any) => w.id);
  const isTrash = req.query.show_deleted === 'true';
  let translatedTitleMap: Record<number, string> = {};
  let translatedDescMap: Record<number, string> = {};
  if (req.query.language_id && webinarIds.length > 0) {
    const langId = parseInt(req.query.language_id as string);
    if (langId) {
      let tQ = supabase
        .from('webinar_translations')
        .select('webinar_id, title, short_description')
        .in('webinar_id', webinarIds)
        .eq('language_id', langId);
      if (!isTrash) tQ = tQ.is('deleted_at', null);
      const { data: translations } = await tQ;
      if (translations) {
        for (const t of translations) {
          if (t.title) translatedTitleMap[t.webinar_id] = t.title;
          if (t.short_description) translatedDescMap[t.webinar_id] = t.short_description;
        }
      }
    }
  }

  const enriched = (data || []).map((w: any) => ({
    ...w,
    translated_title: translatedTitleMap[w.id] || null,
    translated_description: translatedDescMap[w.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Webinar not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Validate fields
  const valErr = validateFields(body);
  if (valErr) return err(res, valErr, 400);

  // Verify course exists if provided
  if (body.course_id) {
    const { data: course } = await supabase.from('courses').select('id, name').eq('id', body.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  // Phase 45 — owner ↔ instructor pairing (replaces the bare existence check)
  const ownerErr = await validateOwnerInstructor(body.webinar_owner, body.instructor_id);
  if (ownerErr) return err(res, ownerErr, 400);

  // Auto-generate code & slug (ignore user input — always generate fresh)
  body.code = await generateUniqueCode();
  body.slug = await generateUniqueSlug(body.title || '');
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_created', targetType: 'webinar', targetId: data.id, targetName: body.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  // Validate fields
  const valErr = validateFields(updates);
  if (valErr) return err(res, valErr, 400);

  // Prevent code & slug from being changed manually — they are auto-generated
  delete updates.code;
  delete updates.slug;

  // Phase 45 — re-validate owner ↔ instructor only when either changes.
  if ('webinar_owner' in updates || 'instructor_id' in updates) {
    const effOwner = 'webinar_owner' in updates ? updates.webinar_owner : (old as any).webinar_owner;
    const effInstr = 'instructor_id' in updates ? updates.instructor_id : (old as any).instructor_id;
    const ownerErr = await validateOwnerInstructor(effOwner, effInstr);
    if (ownerErr) return err(res, ownerErr, 400);
  }

  // Verify new course if changed
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  if (updates.course_id && updates.course_id !== old.course_id) await clearCache(updates.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_updated', targetType: 'webinar', targetId: id, targetName: updates.title || old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('course_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to webinar_translations
  await supabase
    .from('webinar_translations')
    .update({ deleted_at: now, is_active: false })
    .eq('webinar_id', id)
    .is('deleted_at', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_soft_deleted', targetType: 'webinar', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('course_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to webinar_translations
  await supabase
    .from('webinar_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('webinar_id', id)
    .not('deleted_at', 'is', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_restored', targetType: 'webinar', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('course_id, title').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);

  // Cascade delete translations
  await supabase.from('webinar_translations').delete().eq('webinar_id', id);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_deleted', targetType: 'webinar', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Webinar permanently deleted');
}
