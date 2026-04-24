import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { createBunnyFolder, deleteBunnyFolder } from '../../services/storage.service';

const CACHE_KEY = 'chapters:all';
const clearCache = async (subjectId?: number) => {
  await redis.del(CACHE_KEY);
  if (subjectId) await redis.del(`subjects:all`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.subject_id === 'string') body.subject_id = parseInt(body.subject_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('chapters').select('*, subjects(code, slug)', { count: 'exact' });

  // Search
  if (search) q = q.ilike('slug', `%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.subject_id) q = q.eq('subject_id', parseInt(req.query.subject_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation names for all chapters in this page
  const chapterIds = (data || []).map((c: any) => c.id);
  let englishNameMap: Record<number, string> = {};
  if (chapterIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      const { data: enTranslations } = await supabase
        .from('chapter_translations')
        .select('chapter_id, name')
        .in('chapter_id', chapterIds)
        .eq('language_id', enLang.id)
        .is('deleted_at', null);
      if (enTranslations) {
        for (const t of enTranslations) {
          englishNameMap[t.chapter_id] = t.name;
        }
      }
    }
  }

  const enriched = (data || []).map((c: any) => ({
    ...c,
    english_name: englishNameMap[c.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('chapters')
    .select('*, subjects(code, slug)')
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'Chapter not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'chapter', 'activate')) {
    return err(res, 'Permission denied: chapter:activate required to create inactive', 403);
  }

  // Verify subject exists and get its slug for folder path
  const { data: subject } = await supabase.from('subjects').select('id, slug').eq('id', body.subject_id).single();
  if (!subject) return err(res, 'Subject not found', 404);

  // Set audit field
  body.created_by = req.user!.id;

  // Auto-generate slug from slug field or a name-like field
  const slugSource = body.slug || body.code || body.name || `chapter-${body.subject_id}`;
  body.slug = await generateUniqueSlug(supabase, 'chapters', slugSource);

  const { data, error: e } = await supabase
    .from('chapters')
    .insert(body)
    .select('*, subjects(code, slug)')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Chapter slug already exists for this subject', 409);
    return err(res, e.message, 500);
  }

  // Create Bunny folder: materials/<subject-slug>/<chapter-slug>/
  createBunnyFolder(`materials/${subject.slug}/${data.slug}`).catch(() => {});

  await clearCache(body.subject_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'chapter_created',
    targetType: 'chapter',
    targetId: data.id,
    targetName: data.slug,
    ip: getClientIp(req),
  });
  return ok(res, data, 'Chapter created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('chapters').select('*').eq('id', id).single();
  if (!old) return err(res, 'Chapter not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'chapter', 'activate')) {
      return err(res, 'Permission denied: chapter:activate required to change active status', 403);
    }
  }

  // If changing subject, verify it exists
  if (updates.subject_id && updates.subject_id !== old.subject_id) {
    const { data: subject } = await supabase.from('subjects').select('id').eq('id', updates.subject_id).single();
    if (!subject) return err(res, 'Subject not found', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('chapters')
    .update(updates)
    .eq('id', id)
    .select('*, subjects(code, slug)')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Chapter slug already exists for this subject', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') {
      // skip audit field from changes
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.subject_id);
  if (updates.subject_id && updates.subject_id !== old.subject_id) await clearCache(updates.subject_id);

  logAdmin({
    actorId: req.user!.id,
    action: 'chapter_updated',
    targetType: 'chapter',
    targetId: id,
    targetName: data.slug,
    changes,
    ip: getClientIp(req),
  });

  return ok(res, data, 'Chapter updated');
}

// DELETE /chapters/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('chapters').select('slug, subject_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Chapter not found', 404);
  if (old.deleted_at) return err(res, 'Chapter is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('chapters')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to chapter translations
  await supabase.from('chapter_translations').update({ deleted_at: now, is_active: false }).eq('chapter_id', id).is('deleted_at', null);

  // Cascade soft-delete to child topics and their translations
  const { data: childTopics } = await supabase.from('topics').select('id').eq('chapter_id', id).is('deleted_at', null);
  if (childTopics && childTopics.length > 0) {
    const tIds = childTopics.map((t: any) => t.id);
    await supabase.from('topic_translations').update({ deleted_at: now, is_active: false }).in('topic_id', tIds).is('deleted_at', null);
    await supabase.from('topics').update({ deleted_at: now, is_active: false }).eq('chapter_id', id).is('deleted_at', null);

    // Cascade to sub-topics under those topics
    const { data: childSubTopics } = await supabase.from('sub_topics').select('id').in('topic_id', tIds).is('deleted_at', null);
    if (childSubTopics && childSubTopics.length > 0) {
      const stIds = childSubTopics.map((st: any) => st.id);
      await supabase.from('sub_topic_translations').update({ deleted_at: now, is_active: false }).in('sub_topic_id', stIds).is('deleted_at', null);
      await supabase.from('sub_topics').update({ deleted_at: now, is_active: false }).in('topic_id', tIds).is('deleted_at', null);
    }
  }

  await clearCache(old.subject_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'chapter_soft_deleted',
    targetType: 'chapter',
    targetId: id,
    targetName: old.slug,
    ip: getClientIp(req),
  });
  return ok(res, data, 'Chapter moved to trash');
}

// PATCH /chapters/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('chapters').select('slug, subject_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Chapter not found', 404);
  if (!old.deleted_at) return err(res, 'Chapter is not in trash', 400);

  const { data, error: e } = await supabase
    .from('chapters')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to chapter translations
  await supabase.from('chapter_translations').update({ deleted_at: null, is_active: true }).eq('chapter_id', id).not('deleted_at', 'is', null);

  await clearCache(old.subject_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'chapter_restored',
    targetType: 'chapter',
    targetId: id,
    targetName: old.slug,
    ip: getClientIp(req),
  });
  return ok(res, data, 'Chapter restored');
}

// DELETE /chapters/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('chapters').select('slug, subject_id, subjects(slug)').eq('id', id).single();
  if (!old) return err(res, 'Chapter not found', 404);

  // Delete Bunny CDN folder for this chapter (materials/<subject-slug>/<chapter-slug>/)
  const subjectSlug = (old as any).subjects?.slug;
  if (subjectSlug && old.slug) {
    try {
      await deleteBunnyFolder(`materials/${subjectSlug}/${old.slug}`);
    } catch (bunnyErr) {
      console.error(`Failed to delete Bunny folder for chapter ${old.slug}:`, bunnyErr);
    }
  }

  // Cascade: delete child topics (and their sub-topics/translations), then chapter translations
  const { data: childTopics } = await supabase.from('topics').select('id').eq('chapter_id', id);
  if (childTopics && childTopics.length > 0) {
    const tIds = childTopics.map((t: any) => t.id);
    const { data: childSubTopics } = await supabase.from('sub_topics').select('id').in('topic_id', tIds);
    if (childSubTopics && childSubTopics.length > 0) {
      const stIds = childSubTopics.map((st: any) => st.id);
      await supabase.from('sub_topic_translations').delete().in('sub_topic_id', stIds);
      await supabase.from('sub_topics').delete().in('topic_id', tIds);
    }
    await supabase.from('topic_translations').delete().in('topic_id', tIds);
    await supabase.from('topics').delete().eq('chapter_id', id);
  }
  await supabase.from('chapter_translations').delete().eq('chapter_id', id);

  const { error: e } = await supabase.from('chapters').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.subject_id);
  logAdmin({
    actorId: req.user!.id,
    action: 'chapter_deleted',
    targetType: 'chapter',
    targetId: id,
    targetName: old.slug,
    ip: getClientIp(req),
  });

  return ok(res, null, 'Chapter deleted');
}
