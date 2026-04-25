import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { createBunnyFolder, deleteBunnyFolder } from '../../services/storage.service';
import { deleteVideoFromStream } from '../../services/video.service';

const CACHE_KEY = 'subjects:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.estimated_hours === 'string') body.estimated_hours = parseFloat(body.estimated_hours) || null;
  delete body.view_count;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('subjects').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filter by active status
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation names for all subjects in this page
  const subjectIds = (data || []).map((s: any) => s.id);
  let englishNameMap: Record<number, string> = {};
  if (subjectIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      const { data: enTranslations } = await supabase
        .from('subject_translations')
        .select('subject_id, name')
        .in('subject_id', subjectIds)
        .eq('language_id', enLang.id)
        .is('deleted_at', null);
      if (enTranslations) {
        for (const t of enTranslations) {
          englishNameMap[t.subject_id] = t.name;
        }
      }
    }
  }

  const enriched = (data || []).map((s: any) => ({
    ...s,
    english_name: englishNameMap[s.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('subjects').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Subject not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'subject', 'activate')) {
    return err(res, 'Permission denied: subject:activate required to create inactive', 403);
  }

  // Set audit field
  body.created_by = req.user!.id;

  // Auto-generate slug from code or slug field if not provided
  if (!body.slug && body.code) {
    body.slug = await generateUniqueSlug(supabase, 'subjects', body.code);
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'subjects', body.slug);
  }

  const { data, error: e } = await supabase.from('subjects').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Subject code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  // Sync English translation
  if (body.name) {
    await supabase.from('subject_translations').upsert({
      subject_id: data.id,
      language_id: 7,
      name: body.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'subject_id,language_id' });
  }

  // Create Bunny folder: materials/<subject-slug>/
  createBunnyFolder(`materials/${data.slug}`).catch(() => {});

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_created', targetType: 'subject', targetId: data.id, targetName: data.code, ip: getClientIp(req) });
  return ok(res, data, 'Subject created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('*').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'subject', 'activate')) {
      return err(res, 'Permission denied: subject:activate required to change active status', 403);
    }
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('subjects').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Subject code or slug already exists', 409);
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

  // Sync English translation
  if (updates.name) {
    await supabase.from('subject_translations').upsert({
      subject_id: id,
      language_id: 7,
      name: updates.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'subject_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_updated', targetType: 'subject', targetId: id, targetName: data.code, changes, ip: getClientIp(req) });

  return ok(res, data, 'Subject updated');
}

// DELETE /subjects/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);
  if (old.deleted_at) return err(res, 'Subject is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('subjects')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to subject translations
  await supabase.from('subject_translations').update({ deleted_at: now, is_active: false }).eq('subject_id', id).is('deleted_at', null);

  // Cascade soft-delete to child chapters and their translations
  const { data: childChapters } = await supabase.from('chapters').select('id').eq('subject_id', id).is('deleted_at', null);
  if (childChapters && childChapters.length > 0) {
    const cIds = childChapters.map((c: any) => c.id);
    await supabase.from('chapter_translations').update({ deleted_at: now, is_active: false }).in('chapter_id', cIds).is('deleted_at', null);
    await supabase.from('chapters').update({ deleted_at: now, is_active: false }).eq('subject_id', id).is('deleted_at', null);

    // Cascade to topics under those chapters
    const { data: childTopics } = await supabase.from('topics').select('id').in('chapter_id', cIds).is('deleted_at', null);
    if (childTopics && childTopics.length > 0) {
      const tIds = childTopics.map((t: any) => t.id);
      await supabase.from('topic_translations').update({ deleted_at: now, is_active: false }).in('topic_id', tIds).is('deleted_at', null);
      await supabase.from('topics').update({ deleted_at: now, is_active: false }).in('chapter_id', cIds).is('deleted_at', null);

      // Cascade to sub-topics under those topics
      const { data: childSubTopics } = await supabase.from('sub_topics').select('id').in('topic_id', tIds).is('deleted_at', null);
      if (childSubTopics && childSubTopics.length > 0) {
        const stIds = childSubTopics.map((st: any) => st.id);
        await supabase.from('sub_topic_translations').update({ deleted_at: now, is_active: false }).in('sub_topic_id', stIds).is('deleted_at', null);
        await supabase.from('sub_topics').update({ deleted_at: now, is_active: false }).in('topic_id', tIds).is('deleted_at', null);
      }
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_soft_deleted', targetType: 'subject', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Subject moved to trash');
}

// PATCH /subjects/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);
  if (!old.deleted_at) return err(res, 'Subject is not in trash', 400);

  const { data, error: e } = await supabase
    .from('subjects')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to subject translations
  await supabase.from('subject_translations').update({ deleted_at: null, is_active: true }).eq('subject_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_restored', targetType: 'subject', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Subject restored');
}

// DELETE /subjects/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('code, slug').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);

  // Delete Bunny CDN folder for this subject (materials/<slug>/)
  if (old.slug) {
    try {
      await deleteBunnyFolder(`materials/${old.slug}`);
    } catch (bunnyErr) {
      console.error(`Failed to delete Bunny folder for subject ${old.slug}:`, bunnyErr);
    }
  }

  // Cascade: delete entire tree under this subject
  const { data: childChapters } = await supabase.from('chapters').select('id').eq('subject_id', id);
  if (childChapters && childChapters.length > 0) {
    const cIds = childChapters.map((c: any) => c.id);
    const { data: childTopics } = await supabase.from('topics').select('id').in('chapter_id', cIds);
    if (childTopics && childTopics.length > 0) {
      const tIds = childTopics.map((t: any) => t.id);
      const { data: childSubTopics } = await supabase.from('sub_topics').select('id, video_id, video_source').in('topic_id', tIds);
      if (childSubTopics && childSubTopics.length > 0) {
        // Delete Bunny Stream videos for each sub-topic
        for (const st of childSubTopics) {
          if (st.video_id && st.video_source === 'bunny') {
            try { await deleteVideoFromStream(st.video_id); } catch {}
          }
        }
        const stIds = childSubTopics.map((st: any) => st.id);
        await supabase.from('sub_topic_translations').delete().in('sub_topic_id', stIds);
        await supabase.from('sub_topics').delete().in('topic_id', tIds);
      }
      await supabase.from('topic_translations').delete().in('topic_id', tIds);
      await supabase.from('topics').delete().in('chapter_id', cIds);
    }
    await supabase.from('chapter_translations').delete().in('chapter_id', cIds);
    await supabase.from('chapters').delete().eq('subject_id', id);
  }
  await supabase.from('subject_translations').delete().eq('subject_id', id);

  const { error: e } = await supabase.from('subjects').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_deleted', targetType: 'subject', targetId: id, targetName: old.code, ip: getClientIp(req) });

  return ok(res, null, 'Subject deleted');
}
