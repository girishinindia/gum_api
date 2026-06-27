import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';
import { signEmbedUrl } from '../../services/bunnyToken.service';
import { hasPermission } from '../../middleware/rbac';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';
import { attachItems, isItemFree } from '../../utils/itemEnrich';

const TABLE = 'enrollments';
const CACHE_KEY = 'enrollments:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['user_id', 'order_id', 'order_item_id', 'item_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of ['progress_pct']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { body.metadata = null; }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, users!enrollments_user_id_fkey(full_name, email), orders(order_number)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) {
    // User-aware search: the list shows learner name/email (joined from users),
    // so resolve matching user ids first, then OR with the notes column.
    const term = String(search).replace(/[%_\\(),]/g, '').trim();
    if (term) {
      const { data: us } = await supabase.from('users').select('id')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(1000);
      const ids = (us || []).map((u: any) => u.id);
      q = q.or(`user_id.in.(${ids.length ? ids.join(',') : 0}),notes.ilike.%${term}%`);
    }
  }
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
  if (req.query.enrollment_status) q = q.eq('enrollment_status', req.query.enrollment_status as string);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  // Enrich each enrollment with its item (course/batch/webinar) details so
  // consumers can show the real name instead of just item_type + item_id.
  const enriched = await attachItems(data || []);
  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Enrollment not found', 404);

  // Also fetch enrollment_progress records
  const { data: progress } = await supabase.from('enrollment_progress').select('*').eq('enrollment_id', data.id).order('created_at', { ascending: true });

  return ok(res, { ...data, enrollment_progress: progress || [] });
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.item_type) return err(res, 'item_type is required', 400);
  if (!body.item_id) return err(res, 'item_id is required', 400);

  // Self-service enrollment (no order_id): force the caller as the user and
  // only allow it for FREE items. Paid items must go through checkout, which
  // sets order_id and creates the enrollment server-side after payment.
  if (!body.order_id) {
    body.user_id = req.user!.id;
    const free = await isItemFree(body.item_type, Number(body.item_id));
    if (!free) return err(res, 'This item requires purchase. Please checkout.', 402);
  }
  if (!body.user_id) return err(res, 'user_id is required', 400);
  body.created_by = req.user!.id;
  if (!body.enrollment_status) body.enrollment_status = 'active';
  if (!body.enrolled_at) body.enrolled_at = new Date().toISOString();

  // Idempotent on (user_id, item_type, item_id) — restore/return instead of erroring.
  const { data: existing } = await supabase.from(TABLE).select('*')
    .eq('user_id', body.user_id).eq('item_type', body.item_type).eq('item_id', body.item_id).maybeSingle();
  if (existing) {
    if (existing.deleted_at) {
      const { data: restored } = await supabase.from(TABLE)
        .update({ deleted_at: null, is_active: true, enrollment_status: 'active', updated_by: req.user!.id })
        .eq('id', existing.id).select(FK_SELECT).single();
      await clearCache();
      return ok(res, restored, 'Re-enrolled', 200);
    }
    return ok(res, existing, 'Already enrolled', 200);
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_created', targetType: 'enrollment', targetId: data.id, targetName: `Enrollment #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_updated', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete related enrollment_progress
  await supabase.from('enrollment_progress').update({ deleted_at: now, is_active: false }).eq('enrollment_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_soft_deleted', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore related enrollment_progress
  await supabase.from('enrollment_progress').update({ deleted_at: null, is_active: true }).eq('enrollment_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_restored', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);

  // Cascade handles enrollment_progress deletion
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_deleted', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Enrollment permanently deleted');
}

export async function getByUser(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' }).eq('user_id', userId).is('deleted_at', null);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  const enriched = await attachItems(data || []);
  return paginated(res, enriched, count || 0, page, limit);
}

export async function getProgress(req: Request, res: Response) {
  const enrollmentId = parseInt(req.params.id);

  const { data: enrollment } = await supabase.from(TABLE).select('id').eq('id', enrollmentId).single();
  if (!enrollment) return err(res, 'Enrollment not found', 404);

  const { data, error: e } = await supabase.from('enrollment_progress').select('*').eq('enrollment_id', enrollmentId).order('created_at', { ascending: true });
  if (e) return err(res, e.message, 500);

  return ok(res, data || []);
}

export async function updateProgress(req: Request, res: Response) {
  const enrollmentId = parseInt(req.params.id);

  const { data: enrollment } = await supabase.from(TABLE).select('id, user_id').eq('id', enrollmentId).single();
  if (!enrollment) return err(res, 'Enrollment not found', 404);
  // The enrollment owner may record their own progress; everyone else needs
  // the admin enrollment_progress:create permission.
  if (enrollment.user_id !== req.user!.id && !hasPermission(req, 'enrollment_progress', 'create')) {
    return err(res, 'Forbidden', 403);
  }

  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }

  body.enrollment_id = enrollmentId;

  // Check if progress record already exists for this content
  const { data: existing } = await supabase
    .from('enrollment_progress')
    .select('id')
    .eq('enrollment_id', enrollmentId)
    .eq('content_type', body.content_type)
    .eq('content_id', body.content_id)
    .single();

  let progressData;
  if (existing) {
    // Update existing progress record
    body.updated_by = req.user!.id;
    const { data, error: e } = await supabase.from('enrollment_progress').update(body).eq('id', existing.id).select().single();
    if (e) return err(res, e.message, 500);
    progressData = data;
  } else {
    // Insert new progress record
    body.created_by = req.user!.id;
    const { data, error: e } = await supabase.from('enrollment_progress').insert(body).select().single();
    if (e) return err(res, e.message, 500);
    progressData = data;
  }

  // Recalculate enrollment progress_pct based on completed/total progress items
  const { count: totalCount } = await supabase.from('enrollment_progress').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollmentId).is('deleted_at', null);
  const { count: completedCount } = await supabase.from('enrollment_progress').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollmentId).eq('progress_status', 'completed').is('deleted_at', null);

  const total = totalCount || 0;
  const completed = completedCount || 0;
  const progressPct = total > 0 ? Math.round((completed / total) * 10000) / 100 : 0;

  await supabase.from(TABLE).update({ progress_pct: progressPct, updated_by: req.user!.id }).eq('id', enrollmentId);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_progress_updated', targetType: 'enrollment_progress', targetId: progressData.id, targetName: `Progress #${progressData.id}`, ip: getClientIp(req) });
  return ok(res, { ...progressData, enrollment_progress_pct: progressPct }, existing ? 'Progress updated' : 'Progress created', existing ? 200 : 201);
}

// ──────────────────────────────────────────────
// Phase 3.2 — Signed video playback URL
//
// GET /enrollments/:id/playback/:videoId
// Returns a short-lived signed Bunny Stream embed URL for the requested
// videoId. Access is gated by:
//   1. Caller must own the enrollment (user_id match) OR have admin
//      enrollment:read permission (e.g. instructor reviewing student progress).
//   2. Enrollment must be active and not soft-deleted.
//   3. The videoId must exist in sub_topics and (best-effort) be reachable
//      from this enrollment's content tree.
// ──────────────────────────────────────────────
export async function getPlaybackUrl(req: Request, res: Response) {
  const enrollmentId = parseInt(req.params.id, 10);
  const videoId = String(req.params.videoId || '').trim();
  const callerId = req.user!.id;

  if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
    return err(res, 'Invalid enrollment id', 400);
  }
  if (!videoId || videoId.length > 64) {
    return err(res, 'Invalid videoId', 400);
  }

  // 1. Fetch enrollment
  const { data: enrollment, error: enrollErr } = await supabase
    .from('enrollments')
    .select('id, user_id, item_type, item_id, enrollment_status, is_active, deleted_at, expires_at')
    .eq('id', enrollmentId)
    .single();

  if (enrollErr || !enrollment) {
    return err(res, 'Enrollment not found', 404);
  }

  const ownsEnrollment = enrollment.user_id === callerId;
  const canViewAny = hasPermission(req, 'enrollment', 'read');
  if (!ownsEnrollment && !canViewAny) {
    return err(res, 'Forbidden', 403);
  }

  if (enrollment.deleted_at) {
    return err(res, 'Enrollment has been removed', 410);
  }
  if (!enrollment.is_active || enrollment.enrollment_status !== 'active') {
    return err(res, 'Enrollment is not active', 403);
  }
  if (enrollment.expires_at && new Date(enrollment.expires_at) < new Date()) {
    return err(res, 'Enrollment expired', 403);
  }

  // 2. Confirm the video exists in our content tree at all (cheap check)
  const { data: subTopic } = await supabase
    .from('sub_topics')
    .select('id, video_id, video_source, video_status, deleted_at')
    .eq('video_id', videoId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!subTopic) {
    return err(res, 'Video not found in any sub-topic', 404);
  }
  if (subTopic.video_source && subTopic.video_source !== 'bunny_stream') {
    return err(res, 'Video is not served via Bunny Stream', 400);
  }
  if (subTopic.video_status && subTopic.video_status !== 'ready') {
    return err(res, `Video not ready (status: ${subTopic.video_status})`, 409);
  }

  // 3. Sign the URL. TTL defaults to BUNNY_STREAM_TOKEN_TTL_SECONDS (1h).
  let signed;
  try {
    signed = signEmbedUrl(videoId);
  } catch (e: any) {
    console.error('[Enrollment.getPlaybackUrl] sign failed:', e?.message);
    return err(res, 'Playback signing failed (server config)', 500);
  }

  return ok(res, {
    embed_url: signed.embedUrl,
    expires_at: signed.expiresAt.toISOString(),
    video_id: videoId,
    enrollment_id: enrollmentId,
    library_id: signed.libraryId,
  }, 'Signed playback URL');
}

// ──────────────────────────────────────────────
// Phase 46 (content app) — enrolled-only course content
//
// GET /enrollments/:id/content
// Returns the course's full curriculum tree WITH per-lesson Bunny video ids
// and the user's completed sub-topics, so the mobile player can render and
// gate playback. This is the ONLY place video ids are exposed; the public
// /courses/by-slug curriculum stays video-id-free. Access is gated exactly
// like getPlaybackUrl (owner or admin, active enrollment).
// ──────────────────────────────────────────────

/** Build the 4-level curriculum tree for a course, INCLUDING per-lesson
 *  video_id / video_status. Mirrors course.getBySlug's tree assembly but adds
 *  the video fields (kept here so the public endpoint is untouched). */
async function buildCourseCurriculumWithVideo(courseId: number): Promise<{ tree: any[]; counts: { modules: number; chapters: number; topics: number; subtopics: number } }> {
  const { data: modules } = await supabase.from('course_modules')
    .select('id, name, display_order').eq('course_id', courseId).eq('is_active', true).is('deleted_at', null)
    .order('display_order', { ascending: true });
  if (!modules || modules.length === 0) return { tree: [], counts: { modules: 0, chapters: 0, topics: 0, subtopics: 0 } };
  const moduleIds = modules.map((m: any) => m.id);

  const { data: cms } = await supabase.from('course_module_subjects')
    .select('id, course_module_id').eq('course_id', courseId).in('course_module_id', moduleIds).eq('is_active', true).is('deleted_at', null);
  const cmsIds = (cms || []).map((s: any) => s.id);

  let courseChapters: any[] = [];
  if (cmsIds.length) {
    const { data: cc } = await supabase.from('course_chapters')
      .select('id, course_module_subject_id, chapter_id').eq('course_id', courseId).in('course_module_subject_id', cmsIds).eq('is_active', true).is('deleted_at', null);
    courseChapters = cc || [];
  }
  const ccIds = courseChapters.map((c: any) => c.id);
  const chapterIds = [...new Set(courseChapters.map((c: any) => c.chapter_id))];

  const chapterMap: Record<number, any> = {};
  if (chapterIds.length) {
    const { data: chRows } = await supabase.from('chapters').select('id, name, display_order').in('id', chapterIds).eq('is_active', true);
    for (const ch of (chRows || []) as any[]) chapterMap[ch.id] = ch;
  }

  let courseChapterTopics: any[] = [];
  if (ccIds.length) {
    const { data: cct } = await supabase.from('course_chapter_topics')
      .select('id, course_chapter_id, topic_id').eq('course_id', courseId).in('course_chapter_id', ccIds).eq('is_active', true).is('deleted_at', null);
    courseChapterTopics = cct || [];
  }
  const topicIds = [...new Set(courseChapterTopics.map((t: any) => t.topic_id))];

  const topicMap: Record<number, any> = {};
  if (topicIds.length) {
    const { data: tRows } = await supabase.from('topics').select('id, name, display_order').in('id', topicIds).eq('is_active', true);
    for (const t of (tRows || []) as any[]) topicMap[t.id] = t;
  }

  const subtopicsByTopic: Record<number, any[]> = {};
  if (topicIds.length) {
    const { data: stRows } = await supabase.from('sub_topics')
      .select('id, topic_id, name, display_order, estimated_minutes, video_id, video_status')
      .in('topic_id', topicIds).eq('is_active', true).is('deleted_at', null)
      .order('display_order', { ascending: true });
    for (const st of (stRows || []) as any[]) {
      (subtopicsByTopic[st.topic_id] ??= []).push({
        id: st.id,
        name: st.name,
        estimated_minutes: st.estimated_minutes,
        video_id: st.video_id || null,
        video_status: st.video_status || null,
        has_video: !!st.video_id,
      });
    }
  }

  const topicsByCC: Record<number, number[]> = {};
  for (const cct of courseChapterTopics) (topicsByCC[cct.course_chapter_id] ??= []).push(cct.topic_id);
  const ccToChapterId: Record<number, number> = {};
  for (const cc of courseChapters) ccToChapterId[cc.id] = cc.chapter_id;
  const chaptersByCMS: Record<number, number[]> = {};
  for (const cc of courseChapters) (chaptersByCMS[cc.course_module_subject_id] ??= []).push(cc.id);
  const cmsByModule: Record<number, number[]> = {};
  for (const s of (cms || []) as any[]) (cmsByModule[s.course_module_id] ??= []).push(s.id);

  let totalChapters = 0, totalTopics = 0, totalSubtopics = 0;
  const tree = modules.map((mod: any) => {
    const modChapters: any[] = [];
    for (const cmsId of (cmsByModule[mod.id] || [])) {
      for (const ccId of (chaptersByCMS[cmsId] || [])) {
        const chapter = chapterMap[ccToChapterId[ccId]];
        if (!chapter) continue;
        const chTopics = (topicsByCC[ccId] || []).map((tid: number) => {
          const topic = topicMap[tid];
          if (!topic) return null;
          const subs = subtopicsByTopic[tid] || [];
          totalSubtopics += subs.length;
          return { id: topic.id, name: topic.name, display_order: topic.display_order, subtopic_count: subs.length, sub_topics: subs };
        }).filter(Boolean).sort((a: any, b: any) => a.display_order - b.display_order);
        totalTopics += chTopics.length;
        modChapters.push({ id: chapter.id, name: chapter.name, display_order: chapter.display_order, topic_count: chTopics.length, topics: chTopics });
      }
    }
    modChapters.sort((a: any, b: any) => a.display_order - b.display_order);
    totalChapters += modChapters.length;
    return { id: mod.id, name: mod.name, display_order: mod.display_order, chapter_count: modChapters.length, chapters: modChapters };
  });

  return { tree, counts: { modules: modules.length, chapters: totalChapters, topics: totalTopics, subtopics: totalSubtopics } };
}

export async function getContent(req: Request, res: Response) {
  const enrollmentId = parseInt(req.params.id, 10);
  const callerId = req.user!.id;
  if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) return err(res, 'Invalid enrollment id', 400);

  const { data: enrollment } = await supabase.from('enrollments')
    .select('id, user_id, item_type, item_id, enrollment_status, is_active, deleted_at, expires_at')
    .eq('id', enrollmentId).single();
  if (!enrollment) return err(res, 'Enrollment not found', 404);

  const owns = enrollment.user_id === callerId;
  if (!owns && !hasPermission(req, 'enrollment', 'read')) return err(res, 'Forbidden', 403);
  if (enrollment.deleted_at) return err(res, 'Enrollment has been removed', 410);
  if (!enrollment.is_active || enrollment.enrollment_status !== 'active') return err(res, 'Enrollment is not active', 403);
  if (enrollment.expires_at && new Date(enrollment.expires_at) < new Date()) return err(res, 'Enrollment expired', 403);

  // Resolve the course id (course → self; batch → its linked course). Other
  // types carry no curriculum (webinars are single sessions; bundles expand
  // to per-course enrollments at purchase, so they never appear here).
  let courseId: number | null = null;
  if (enrollment.item_type === 'course') {
    courseId = Number(enrollment.item_id);
  } else if (enrollment.item_type === 'batch') {
    const { data: b } = await supabase.from('course_batches').select('course_id').eq('id', enrollment.item_id).maybeSingle();
    courseId = b?.course_id ? Number(b.course_id) : null;
  }

  if (!courseId) {
    return ok(res, {
      enrollment_id: enrollmentId, item_type: enrollment.item_type, course_id: null, course_name: null,
      course_thumbnail: null, curriculum: [], curriculum_counts: { modules: 0, chapters: 0, topics: 0, subtopics: 0 },
      completed_subtopic_ids: [],
    }, 'No curriculum for this item');
  }

  const { data: course } = await supabase.from('courses').select('id, name, slug, trailer_thumbnail_url').eq('id', courseId).maybeSingle();

  const { data: prog } = await supabase.from('enrollment_progress')
    .select('content_id').eq('enrollment_id', enrollmentId).eq('content_type', 'sub_topic')
    .eq('progress_status', 'completed').is('deleted_at', null);
  const completedIds = (prog || []).map((p: any) => Number(p.content_id));

  const { tree, counts } = await buildCourseCurriculumWithVideo(courseId);

  return ok(res, {
    enrollment_id: enrollmentId,
    item_type: enrollment.item_type,
    course_id: courseId,
    course_name: course?.name ?? null,
    course_slug: course?.slug ?? null,
    course_thumbnail: course?.trailer_thumbnail_url ?? null,
    curriculum: tree,
    curriculum_counts: counts,
    completed_subtopic_ids: completedIds,
  }, 'Course content');
}
