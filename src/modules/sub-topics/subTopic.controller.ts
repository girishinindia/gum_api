import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin, logData } from '../../services/activityLog.service';
import { uploadVideoToStream, deleteVideoFromStream, getVideoStatus } from '../../services/video.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'sub_topics:all';
const clearCache = async (topicId?: number) => {
  await redis.del(CACHE_KEY);
  if (topicId) await redis.del(`sub_topics:topic:${topicId}`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.estimated_minutes === 'string') body.estimated_minutes = parseInt(body.estimated_minutes) || null;
  if (typeof body.topic_id === 'string') {
    if (body.topic_id === '' || body.topic_id === 'null') {
      body.topic_id = null;
    } else {
      body.topic_id = parseInt(body.topic_id) || null;
    }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('sub_topics').select('*, topics(slug, chapter_id, chapters(subject_id))', { count: 'exact' });

  // Search
  if (search) q = q.ilike('slug', `%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.topic_id) {
    q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  } else if (req.query.chapter_id) {
    // Get topic IDs for this chapter, then filter sub-topics
    const { data: chTopics } = await supabase.from('topics').select('id').eq('chapter_id', parseInt(req.query.chapter_id as string)).is('deleted_at', null);
    const topicIds = (chTopics || []).map((t: any) => t.id);
    if (topicIds.length > 0) q = q.in('topic_id', topicIds);
    else q = q.eq('topic_id', -1); // no match
  } else if (req.query.subject_id) {
    // Get chapter IDs for subject, then topic IDs for those chapters
    const { data: subChapters } = await supabase.from('chapters').select('id').eq('subject_id', parseInt(req.query.subject_id as string)).is('deleted_at', null);
    const chapterIds = (subChapters || []).map((c: any) => c.id);
    if (chapterIds.length > 0) {
      const { data: subTopicsList } = await supabase.from('topics').select('id').in('chapter_id', chapterIds).is('deleted_at', null);
      const topicIds = (subTopicsList || []).map((t: any) => t.id);
      if (topicIds.length > 0) q = q.in('topic_id', topicIds);
      else q = q.eq('topic_id', -1);
    } else {
      q = q.eq('topic_id', -1);
    }
  }
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('sub_topics')
    .select('*, topics(slug, chapter_id, chapters(subject_id))')
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'Sub-topic not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'sub_topic', 'activate')) {
    return err(res, 'Permission denied: sub_topic:activate required to create inactive', 403);
  }

  // Verify topic exists if topic_id is provided
  if (body.topic_id) {
    const { data: topic } = await supabase.from('topics').select('id').eq('id', body.topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);
  }

  // Set audit field
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase
    .from('sub_topics')
    .insert(body)
    .select('*, topics(slug, chapter_id, chapters(subject_id))')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Sub-topic slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_created', targetType: 'sub_topic', targetId: data.id, targetName: data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Sub-topic created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topics').select('*').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'sub_topic', 'activate')) {
      return err(res, 'Permission denied: sub_topic:activate required to change active status', 403);
    }
  }

  // If changing topic, verify it exists
  if (updates.topic_id && updates.topic_id !== old.topic_id) {
    const { data: topic } = await supabase.from('topics').select('id').eq('id', updates.topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('sub_topics')
    .update(updates)
    .eq('id', id)
    .select('*, topics(slug, chapter_id, chapters(subject_id))')
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Sub-topic slug already exists', 409);
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

  await clearCache(old.topic_id);
  if (updates.topic_id && updates.topic_id !== old.topic_id) await clearCache(updates.topic_id);

  logAdmin({ actorId: req.user!.id, action: 'sub_topic_updated', targetType: 'sub_topic', targetId: id, targetName: data.slug, changes, ip: getClientIp(req) });

  return ok(res, data, 'Sub-topic updated');
}

// DELETE /sub-topics/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topics').select('slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic not found', 404);
  if (old.deleted_at) return err(res, 'Sub-topic is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('sub_topics')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to sub-topic translations
  await supabase.from('sub_topic_translations').update({ deleted_at: now, is_active: false }).eq('sub_topic_id', id).is('deleted_at', null);

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_soft_deleted', targetType: 'sub_topic', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Sub-topic moved to trash');
}

// PATCH /sub-topics/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topics').select('slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic not found', 404);
  if (!old.deleted_at) return err(res, 'Sub-topic is not in trash', 400);

  const { data, error: e } = await supabase
    .from('sub_topics')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to sub-topic translations
  await supabase.from('sub_topic_translations').update({ deleted_at: null, is_active: true }).eq('sub_topic_id', id).not('deleted_at', 'is', null);

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_restored', targetType: 'sub_topic', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Sub-topic restored');
}

// DELETE /sub-topics/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topics').select('slug, video_id, video_source, topic_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic not found', 404);

  if (old.video_id && old.video_source === 'bunny') {
    try { await deleteVideoFromStream(old.video_id); } catch {}
  }

  // Delete child translations first to avoid FK constraint
  await supabase.from('sub_topic_translations').delete().eq('sub_topic_id', id);

  const { error: e } = await supabase.from('sub_topics').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_deleted', targetType: 'sub_topic', targetId: id, targetName: old.slug, ip: getClientIp(req) });

  return ok(res, null, 'Sub-topic deleted');
}

// POST /sub-topics/:id/upload-video
export async function uploadVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: st } = await supabase.from('sub_topics').select('id, slug, video_id, video_source, topic_id').eq('id', id).single();
  if (!st) return err(res, 'Sub-topic not found', 404);

  if (!req.file) return err(res, 'No video file provided', 400);

  try {
    // Delete old Bunny video if exists
    if (st.video_id && st.video_source === 'bunny') {
      try { await deleteVideoFromStream(st.video_id); } catch {}
    }

    const title = `${st.slug || 'sub-topic'}-${id}`;
    const result = await uploadVideoToStream(req.file.buffer, title);

    const updates: any = {
      video_id: result.videoId,
      video_url: result.embedUrl,
      video_thumbnail_url: result.thumbnailUrl,
      video_status: 'processing',
      video_source: 'bunny',
      youtube_url: null, // clear youtube when uploading
      updated_by: req.user!.id,
    };

    const { data, error: e } = await supabase.from('sub_topics').update(updates).eq('id', id).select('*, topics(slug, chapter_id, chapters(subject_id))').single();
    if (e) return err(res, e.message, 500);

    await clearCache(st.topic_id);
    logAdmin({ actorId: req.user!.id, action: 'sub_topic_updated', targetType: 'sub_topic', targetId: id, targetName: st.slug, changes: { video_source: { old: st.video_source, new: 'bunny' } }, ip: getClientIp(req) });
    logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_topic', resourceId: id, resourceName: st.slug, ip: getClientIp(req), metadata: { type: 'video', videoId: result.videoId } });

    return ok(res, data, 'Video uploaded successfully');
  } catch (e: any) {
    return err(res, e.message || 'Video upload failed', 500);
  }
}

// DELETE /sub-topics/:id/video
export async function deleteVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: st } = await supabase.from('sub_topics').select('id, slug, video_id, video_source, topic_id').eq('id', id).single();
  if (!st) return err(res, 'Sub-topic not found', 404);

  if (st.video_id && st.video_source === 'bunny') {
    try { await deleteVideoFromStream(st.video_id); } catch {}
  }

  const { data, error: e } = await supabase.from('sub_topics').update({
    video_id: null,
    video_url: null,
    video_thumbnail_url: null,
    video_status: null,
    video_source: null,
    youtube_url: null,
    updated_by: req.user!.id,
  }).eq('id', id).select('*, topics(slug, chapter_id, chapters(subject_id))').single();
  if (e) return err(res, e.message, 500);

  await clearCache(st.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_updated', targetType: 'sub_topic', targetId: id, targetName: st.slug, changes: { video: { old: st.video_source, new: null } }, ip: getClientIp(req) });
  logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'sub_topic', resourceId: id, resourceName: st.slug, ip: getClientIp(req), metadata: { type: 'video' } });

  return ok(res, data, 'Video removed');
}

// GET /sub-topics/:id/video-status
export async function videoStatus(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: st } = await supabase.from('sub_topics').select('video_id, video_source, video_status').eq('id', id).single();
  if (!st) return err(res, 'Sub-topic not found', 404);
  if (!st.video_id || st.video_source !== 'bunny') return ok(res, { status: st.video_status || null });

  try {
    const info = await getVideoStatus(st.video_id);
    // Bunny status: 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
    let status = 'processing';
    if (info.status === 4) status = 'ready';
    else if (info.status === 5 || info.status === 6) status = 'failed';

    if (status !== st.video_status) {
      await supabase.from('sub_topics').update({ video_status: status }).eq('id', id);
    }

    return ok(res, { status, encodeProgress: info.encodeProgress, length: info.length });
  } catch (e: any) {
    return ok(res, { status: st.video_status || 'unknown' });
  }
}
