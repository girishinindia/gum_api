import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';
import { validateOwnerInstructor } from '../../utils/ownerInstructor';

const TABLE = 'course_batches';
const CACHE_KEY = 'course_batches:all';

const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`course_batches:course:${courseId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_free === 'string') body.is_free = body.is_free === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.includes_course_access === 'string') body.includes_course_access = body.includes_course_access === 'true';
  // Integer fields
  for (const k of ['course_id', 'instructor_id', 'max_students', 'enrolled_count', 'display_order']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Numeric fields
  if (typeof body.price === 'string') body.price = parseFloat(body.price) || 0;
  // JSONB fields
  if (typeof body.schedule === 'string') {
    try { body.schedule = JSON.parse(body.schedule); } catch { /* leave as-is */ }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// Phase 44.4 — embed enough course columns that the admin "Batch
// Details" view dialog can render a proper Course card (code, status,
// difficulty, pricing, thumbnail) instead of just the course name.
const FK_SELECT = `*, courses(id, name, slug, code, course_status, difficulty_level, price, original_price, is_free, trailer_thumbnail_url), users!course_batches_instructor_id_fkey(id, full_name, email)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['title', 'code'] });
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.batch_status) q = q.eq('batch_status', req.query.batch_status as string);
  else q = q.neq('batch_status', 'cancelled'); // hide cancelled batches by default
  if (req.query.batch_owner) q = q.eq('batch_owner', req.query.batch_owner as string);
  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  else q = q.eq('is_active', true); // public list defaults to active
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

  // Fetch translated title + description + thumbnail for the requested language
  const batchIds = (data || []).map((b: any) => b.id);
  const isTrash = req.query.show_deleted === 'true';
  let translatedTitleMap: Record<number, string> = {};
  let translatedDescMap: Record<number, string> = {};
  let translatedThumbMap: Record<number, string> = {};
  if (req.query.language_id && batchIds.length > 0) {
    const langId = parseInt(req.query.language_id as string);
    if (langId) {
      let tQ = supabase
        .from('batch_translations')
        .select('batch_id, title, short_description, thumbnail_url')
        .in('batch_id', batchIds)
        .eq('language_id', langId);
      if (!isTrash) tQ = tQ.is('deleted_at', null);
      const { data: translations } = await tQ;
      if (translations) {
        for (const t of translations) {
          if (t.title) translatedTitleMap[t.batch_id] = t.title;
          if (t.short_description) translatedDescMap[t.batch_id] = t.short_description;
          if (t.thumbnail_url) translatedThumbMap[t.batch_id] = t.thumbnail_url;
        }
      }
    }
  }

  // Fallback: course_batches table has NO image column — fetch any available
  // thumbnail from translations for items still missing one
  const missingThumbBatchIds = batchIds.filter((id: number) => !translatedThumbMap[id]);
  if (missingThumbBatchIds.length > 0) {
    let fbQ = supabase
      .from('batch_translations')
      .select('batch_id, thumbnail_url')
      .in('batch_id', missingThumbBatchIds)
      .not('thumbnail_url', 'is', null);
    if (!isTrash) fbQ = fbQ.is('deleted_at', null);
    const { data: fbTrans } = await fbQ;
    if (fbTrans) {
      for (const t of fbTrans) {
        if (t.thumbnail_url && !translatedThumbMap[t.batch_id]) {
          translatedThumbMap[t.batch_id] = t.thumbnail_url;
        }
      }
    }
  }

  const enriched = (data || []).map((b: any) => ({
    ...b,
    translated_title: translatedTitleMap[b.id] || null,
    translated_description: translatedDescMap[b.id] || null,
    translated_thumbnail: translatedThumbMap[b.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course batch not found', 404);

  // Same translation enrichment as getBySlug — id-based consumers otherwise
  // see none of the translated content stored in batch_translations.
  const langId = req.query.language_id ? parseInt(req.query.language_id as string) : 7;
  let translation: any = null;
  {
    const { data: t } = await supabase
      .from('batch_translations')
      .select('*')
      .eq('batch_id', data.id)
      .eq('language_id', langId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    translation = t;
  }
  if (!translation && langId !== 7) {
    const { data: t } = await supabase
      .from('batch_translations')
      .select('*')
      .eq('batch_id', data.id)
      .eq('language_id', 7)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    translation = t;
  }

  return ok(res, { ...data, translation });
}

/**
 * Public detail endpoint — returns a full batch by slug with:
 *   • full translation row (requested language, fallback to English id=7)
 *   • parent course info
 *   • instructor profile
 *
 * GET /course-batches/by-slug/:slug?language_id=7
 */
export async function getBySlug(req: Request, res: Response) {
  const slug = req.params.slug;

  // 1. Fetch the batch row with FK joins
  const { data: batch, error: e1 } = await supabase
    .from(TABLE)
    .select(FK_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();
  if (e1 || !batch) return err(res, 'Course batch not found', 404);

  // 2. Fetch translation — prefer requested language, fallback to English (id=7)
  const langId = req.query.language_id ? parseInt(req.query.language_id as string) : 7;
  let translation: any = null;
  {
    const { data: t } = await supabase
      .from('batch_translations')
      .select('*')
      .eq('batch_id', batch.id)
      .eq('language_id', langId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    translation = t;
  }
  if (!translation && langId !== 7) {
    const { data: t } = await supabase
      .from('batch_translations')
      .select('*')
      .eq('batch_id', batch.id)
      .eq('language_id', 7)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    translation = t;
  }

  // 3. Fetch instructor profile (if not already in FK_SELECT user data)
  let instructor: any = null;
  if (batch.instructor_id) {
    const batchUser = (batch as any).users;
    instructor = batchUser ? { id: batchUser.id, full_name: batchUser.full_name, email: batchUser.email } : null;
    if (instructor) {
      const { data: ip } = await supabase
        .from('instructor_profiles')
        .select('designation, bio, expertise, linkedin_url, website_url, total_students, total_courses, years_experience, rating_average, profile_image_url')
        .eq('user_id', instructor.id)
        .is('deleted_at', null)
        .single();
      if (ip) instructor = { ...instructor, ...ip };
    }
  }

  // 4. Fetch parent course translation for title/thumbnail
  let courseTranslation: any = null;
  if (batch.course_id) {
    const { data: ct } = await supabase
      .from('course_translations')
      .select('title, short_intro, web_thumbnail')
      .eq('course_id', batch.course_id)
      .eq('language_id', langId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    courseTranslation = ct;
  }

  // 5. Assemble response
  return ok(res, {
    ...batch,
    translation: translation || null,
    instructor: instructor || null,
    course_translation: courseTranslation || null,
  });
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Phase 45 — owner ↔ instructor pairing (replaces the bare existence check)
  const ownerErr = await validateOwnerInstructor(body.batch_owner, body.instructor_id);
  if (ownerErr) return err(res, ownerErr, 400);

  // Auto-generate slug if not provided
  if (!body.slug) {
    const slugSource = body.title || body.code || 'batch';
    body.slug = await generateUniqueSlug(supabase, TABLE, slugSource);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_batch_created', targetType: 'course_batch', targetId: data.id, targetName: body.title || body.code || `batch:${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Course batch created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Course batch not found', 404);

  const updates = parseBody(req);

  // Phase 45 — re-validate owner ↔ instructor only when either changes.
  if ('batch_owner' in updates || 'instructor_id' in updates) {
    const effOwner = 'batch_owner' in updates ? updates.batch_owner : (old as any).batch_owner;
    const effInstr = 'instructor_id' in updates ? updates.instructor_id : (old as any).instructor_id;
    const ownerErr = await validateOwnerInstructor(effOwner, effInstr);
    if (ownerErr) return err(res, ownerErr, 400);
  }

  // Auto-generate slug if title changed and slug not explicitly provided
  if (updates.title && updates.title !== old.title && !updates.slug) {
    updates.slug = await generateUniqueSlug(supabase, TABLE, updates.title, id);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_batch_updated', targetType: 'course_batch', targetId: id, targetName: updates.title || old.title || `batch:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Course batch updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('course_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course batch not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to batch_translations
  await supabase
    .from('batch_translations')
    .update({ deleted_at: now, is_active: false })
    .eq('batch_id', id)
    .is('deleted_at', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_batch_soft_deleted', targetType: 'course_batch', targetId: id, targetName: old.title || `batch:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Course batch moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('course_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course batch not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to batch_translations (restore those deleted at the same time as the batch)
  await supabase
    .from('batch_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('batch_id', id)
    .not('deleted_at', 'is', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_batch_restored', targetType: 'course_batch', targetId: id, targetName: old.title || `batch:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Course batch restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('course_id, title').eq('id', id).single();
  if (!old) return err(res, 'Course batch not found', 404);

  // Cascade: delete translations
  await supabase.from('batch_translations').delete().eq('batch_id', id);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_batch_deleted', targetType: 'course_batch', targetId: id, targetName: old.title || `batch:${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Course batch permanently deleted');
}
