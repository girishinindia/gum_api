import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { createBunnyFolders, deleteBunnyFolder } from '../../services/storage.service';
import { buildCourseFolderName, buildCdnName } from '../../utils/courseParser';
import { archiveYoutubeUrls } from '../../services/youtubeArchive.service';

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
  if (req.query.chapter_id) {
    q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  } else if (req.query.subject_id) {
    // Filter by subject — get chapter IDs belonging to this subject
    const { data: subChapters } = await supabase
      .from('chapters')
      .select('id')
      .eq('subject_id', parseInt(req.query.subject_id as string));
    const chapterIds = (subChapters || []).map((c: any) => c.id);
    if (chapterIds.length > 0) {
      q = q.in('chapter_id', chapterIds);
    } else {
      // No chapters under this subject — return empty
      return paginated(res, [], 0, page, limit);
    }
  }
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation names for all topics in this page
  const topicIds = (data || []).map((t: any) => t.id);
  let englishNameMap: Record<number, string> = {};
  if (topicIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      const { data: enTranslations } = await supabase
        .from('topic_translations')
        .select('topic_id, name')
        .in('topic_id', topicIds)
        .eq('language_id', enLang.id)
        .is('deleted_at', null);
      if (enTranslations) {
        for (const t of enTranslations) {
          englishNameMap[t.topic_id] = t.name;
        }
      }
    }
  }

  const enriched = (data || []).map((t: any) => ({
    ...t,
    english_name: englishNameMap[t.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
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

  // Verify chapter exists if chapter_id is provided; also fetch parent info for folder path
  let subjectName: string | null = null;
  let chapterName: string | null = null;
  let chapterOrder: number = 0;
  if (body.chapter_id) {
    const { data: chapter } = await supabase
      .from('chapters')
      .select('id, slug, name, display_order, subject_id, subjects(slug, name)')
      .eq('id', body.chapter_id)
      .single();
    if (!chapter) return err(res, 'Chapter not found', 404);
    chapterName = chapter.name || chapter.slug;
    chapterOrder = chapter.display_order ?? 0;
    subjectName = (chapter as any).subjects?.name || (chapter as any).subjects?.slug || null;
  }

  // Set audit field
  body.created_by = req.user!.id;

  // Auto-generate slug from slug field or name-like field
  const slugSource = body.slug || body.code || body.name || `topic-${body.chapter_id || 0}`;
  body.slug = await generateUniqueSlug(supabase, 'topics', slugSource);

  const { data, error: e } = await supabase
    .from('topics')
    .insert(body)
    .select('*, chapters(slug, subject_id)')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Topic slug already exists', 409);
    return err(res, e.message, 500);
  }

  // Sync English translation
  if (body.name) {
    await supabase.from('topic_translations').upsert({
      topic_id: data.id,
      language_id: 7,
      name: body.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'topic_id,language_id' });
  }

  // Create Bunny folders: materials/<SubjectName>/<Order_ChapterName>/<Order_TopicName>/ + resources/ + lang folders
  // Uses sanitized names to match scaffold convention
  if (subjectName && chapterName) {
    const cdnSubject = buildCourseFolderName(subjectName);
    const cdnChapter = buildCdnName(chapterOrder, chapterName);
    const cdnTopic = buildCdnName(data.display_order ?? 0, body.name || data.slug);
    const basePath = `materials/${cdnSubject}/${cdnChapter}/${cdnTopic}`;
    const folders = [basePath, `${basePath}/resources`];

    // Fetch all active languages for language subfolders
    const { data: languages } = await supabase
      .from('languages')
      .select('iso_code')
      .eq('is_active', true);
    if (languages) {
      for (const lang of languages) {
        folders.push(`${basePath}/${lang.iso_code}`);
      }
    }

    createBunnyFolders(folders).catch(() => {});
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

  // Sync English translation
  if (updates.name) {
    await supabase.from('topic_translations').upsert({
      topic_id: id,
      language_id: 7,
      name: updates.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'topic_id,language_id' });
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

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('topics')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to topic translations
  await supabase.from('topic_translations').update({ deleted_at: now, is_active: false }).eq('topic_id', id).is('deleted_at', null);

  // Cascade soft-delete to child sub-topics and their translations
  const { data: childSubTopics } = await supabase.from('sub_topics').select('id').eq('topic_id', id).is('deleted_at', null);
  if (childSubTopics && childSubTopics.length > 0) {
    const stIds = childSubTopics.map((st: any) => st.id);
    await supabase.from('sub_topic_translations').update({ deleted_at: now, is_active: false }).in('sub_topic_id', stIds).is('deleted_at', null);
    await supabase.from('sub_topics').update({ deleted_at: now, is_active: false }).eq('topic_id', id).is('deleted_at', null);
  }

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

  // Cascade restore to topic translations
  await supabase.from('topic_translations').update({ deleted_at: null, is_active: true }).eq('topic_id', id).not('deleted_at', 'is', null);

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
  const { data: old } = await supabase.from('topics').select('slug, chapter_id, chapters(slug, subjects(slug))').eq('id', id).single();
  if (!old) return err(res, 'Topic not found', 404);

  // Delete Bunny CDN folder for this topic (materials/<subject-slug>/<chapter-slug>/<topic-slug>/)
  const subjectSlug = (old as any).chapters?.subjects?.slug;
  const chapterSlug = (old as any).chapters?.slug;
  if (subjectSlug && chapterSlug && old.slug) {
    try {
      await deleteBunnyFolder(`materials/${subjectSlug}/${chapterSlug}/${old.slug}`);
    } catch (bunnyErr) {
      console.error(`Failed to delete Bunny folder for topic ${old.slug}:`, bunnyErr);
    }
  }

  // Delete child sub-topics and translations (videos retained in Bunny Stream for re-import)
  const { data: childSubTopics } = await supabase.from('sub_topics').select('id').eq('topic_id', id);
  if (childSubTopics && childSubTopics.length > 0) {
    const stIds = childSubTopics.map((st: any) => st.id);
    // Archive YouTube URLs before deletion
    await archiveYoutubeUrls(stIds, req.user?.id);
    await supabase.from('sub_topic_translations').delete().in('sub_topic_id', stIds);
    await supabase.from('sub_topics').delete().eq('topic_id', id);
  }
  await supabase.from('topic_translations').delete().eq('topic_id', id);

  const { error: e } = await supabase.from('topics').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

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
