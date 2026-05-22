import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull } from '../../utils/coerce';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { uploadVideoToStream, deleteVideoFromStream, extractBunnyVideoGuid } from '../../services/video.service';
import { signEmbedUrl } from '../../services/bunnyToken.service';
import { config } from '../../config';

const TABLE = 'podcasts';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

// ── Parse body helper ──
function parseBody(req: Request): any {
  const body: any = { ...req.body };
  for (const k of ['category_id', 'sub_category_id', 'duration_seconds', 'display_order']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  if (typeof body.is_featured === 'string') body.is_featured = body.is_featured === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.tags === 'string') {
    try { body.tags = JSON.parse(body.tags); } catch { body.tags = body.tags.split(',').map((t: string) => t.trim()).filter(Boolean); }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// Columns to select, with poster user join
const FK_SELECT = '*, users!podcasts_posted_by_fkey(id, first_name, last_name, email, avatar_url), categories!podcasts_category_id_fkey(id, name, slug), sub_categories!podcasts_sub_category_id_fkey(id, name, slug, category_id)';

// ══════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth required)
// ══════════════════════════════════════════════════════════════

/** List podcasts — public (only published + coming_soon visible) */
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'published_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  // Public: only published & coming_soon
  const isAdmin = !!(req as any).user;
  if (!isAdmin) {
    q = q.in('status', ['published', 'coming_soon']).is('deleted_at', null);
  } else {
    // Admin can see all statuses
    if (req.query.status) q = q.eq('status', req.query.status as string);
    if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
    else q = q.is('deleted_at', null);
  }

  if (search) q = applySearch(q, search, { ilike: ['title', 'description', 'short_summary'] });
  if (req.query.poster_type) q = q.eq('poster_type', req.query.poster_type as string);
  if (req.query.posted_by) q = q.eq('posted_by', parseInt(req.query.posted_by as string));
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));
  if (req.query.is_featured === 'true') q = q.eq('is_featured', true);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

/** Get single podcast by ID — public */
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Podcast not found', 404);

  // Public callers: only show published/coming_soon
  const isAdmin = !!(req as any).user;
  if (!isAdmin && !['published', 'coming_soon'].includes(data.status)) {
    return err(res, 'Podcast not found', 404);
  }

  return ok(res, data);
}

/** Get signed playback URL for a podcast video */
export async function playback(req: Request, res: Response) {
  const { data } = await supabase.from(TABLE).select('video_url, video_id, youtube_url, status').eq('id', req.params.id).single();
  if (!data) return err(res, 'Podcast not found', 404);

  // Only published podcasts are playable publicly
  const isAdmin = !!(req as any).user;
  if (!isAdmin && data.status !== 'published') return err(res, 'Not available', 403);

  // YouTube → return as-is
  if (data.youtube_url && !data.video_url) return ok(res, { url: data.youtube_url, type: 'youtube' });

  // Bunny Stream → signed embed
  const guid = data.video_id || extractBunnyVideoGuid(data.video_url);
  if (!guid) return ok(res, { url: data.video_url || null, type: 'direct' });
  try {
    const s = signEmbedUrl(guid);
    return ok(res, { url: s.embedUrl, expiresAt: s.expiresAt, type: 'bunny_stream' });
  } catch (e: any) { return err(res, e.message || 'Sign failed', 500); }
}


// ══════════════════════════════════════════════════════════════
// PROTECTED ENDPOINTS (auth + RBAC required)
// ══════════════════════════════════════════════════════════════

// ── Re-approval guard for instructor podcasts ──
// If an instructor edits a published/pending podcast, reset to draft.
async function requireReApprovalIfInstructor(podcastId: number, posterType: string): Promise<void> {
  if (posterType !== 'instructor') return; // system podcasts don't need approval
  try {
    await supabase.from(TABLE)
      .update({ status: 'draft', verified_at: null, verified_by: null })
      .eq('id', podcastId)
      .in('status', ['published', 'pending_approval']);
  } catch { /* swallow — non-fatal */ }
}

/** Create a new podcast */
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  body.posted_by = req.user!.id;

  // Determine poster_type from the user's role level
  // If role level >= 100 (super admin), default to 'system'; otherwise 'instructor'
  if (!body.poster_type) {
    body.poster_type = req.userPerms?.isSuperAdmin ? 'system' : 'instructor';
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_created', targetType: TABLE, targetId: data.id, targetName: data.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast created', 201);
}

/** Update podcast fields */
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Podcast not found', 404);

  const body = parseBody(req);
  // Don't allow changing posted_by or poster_type
  delete body.posted_by;
  delete body.poster_type;

  // If instructor podcast is published/pending → reset to draft (inline for accurate response)
  if (old.poster_type === 'instructor' && (old.status === 'published' || old.status === 'pending_approval')) {
    body.status = 'draft';
    body.verified_at = null;
    body.verified_by = null;
  }

  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_updated', targetType: TABLE, targetId: id, targetName: data.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast updated');
}


// ── Video upload (Bunny Stream) ──

export async function uploadVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (!req.file) return err(res, 'No video file provided', 400);

  try {
    // Delete old Bunny Stream video if exists
    if (row.video_id) { try { await deleteVideoFromStream(row.video_id); } catch {} }
    else {
      const oldGuid = extractBunnyVideoGuid(row.video_url);
      if (oldGuid) { try { await deleteVideoFromStream(oldGuid); } catch {} }
    }

    const title = `Podcast — ${row.title || `podcast-${id}`}`;
    const result = await uploadVideoToStream(req.file.buffer, title);
    const patch: any = {
      video_url: result.embedUrl,
      video_id: result.videoId,
      youtube_url: null, // Bunny upload supersedes YouTube
    };

    const { data, error: e } = await supabase.from(TABLE).update(patch).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await requireReApprovalIfInstructor(id, row.poster_type);
    logAdmin({ actorId: req.user!.id, action: 'podcast_video_uploaded', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
    return ok(res, data, 'Video uploaded');
  } catch (e: any) { return err(res, e.message || 'Video upload failed', 500); }
}

export async function removeVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('video_url, video_id, poster_type, title').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);

  const guid = row.video_id || extractBunnyVideoGuid(row.video_url);
  if (guid) { try { await deleteVideoFromStream(guid); } catch {} }

  const { data, error: e } = await supabase.from(TABLE)
    .update({ video_url: null, video_id: null })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await requireReApprovalIfInstructor(id, row.poster_type);
  logAdmin({ actorId: req.user!.id, action: 'podcast_video_removed', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Video removed');
}


// ── Thumbnail upload (Bunny CDN Storage) ──

export async function uploadThumbnail(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('thumbnail_url, poster_type, title').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (!req.file) return err(res, 'No image file provided', 400);

  try {
    // Delete old thumbnail
    if (row.thumbnail_url && config.bunny.cdnUrl && row.thumbnail_url.startsWith(config.bunny.cdnUrl)) {
      try { await deleteImage(extractBunnyPath(row.thumbnail_url), row.thumbnail_url); } catch {}
    }

    const ts = Date.now();
    const path = `podcasts/${id}/thumbnail-${ts}.webp`;
    const cdnUrl = await processAndUploadImage(req.file.buffer, path, { width: 1280, height: 720 });

    const { data, error: e } = await supabase.from(TABLE).update({ thumbnail_url: cdnUrl }).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await requireReApprovalIfInstructor(id, row.poster_type);
    logAdmin({ actorId: req.user!.id, action: 'podcast_thumbnail_uploaded', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
    return ok(res, data, 'Thumbnail uploaded');
  } catch (e: any) { return err(res, e.message || 'Thumbnail upload failed', 500); }
}

export async function removeThumbnail(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('thumbnail_url, poster_type, title').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);

  if (row.thumbnail_url && config.bunny.cdnUrl && row.thumbnail_url.startsWith(config.bunny.cdnUrl)) {
    try { await deleteImage(extractBunnyPath(row.thumbnail_url), row.thumbnail_url); } catch {}
  }

  const { data, error: e } = await supabase.from(TABLE).update({ thumbnail_url: null }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await requireReApprovalIfInstructor(id, row.poster_type);
  logAdmin({ actorId: req.user!.id, action: 'podcast_thumbnail_removed', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Thumbnail removed');
}


// ══════════════════════════════════════════════════════════════
// STATUS TRANSITIONS
// ══════════════════════════════════════════════════════════════

/** Mark as Coming Soon (draft → coming_soon) — needs at least a thumbnail */
export async function markComingSoon(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (row.status !== 'draft') return err(res, 'Only draft podcasts can be marked as coming soon', 400);
  if (!row.thumbnail_url) return err(res, 'Thumbnail is required for Coming Soon', 400);

  const { data, error: e } = await supabase.from(TABLE)
    .update({ status: 'coming_soon' })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_coming_soon', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast marked as Coming Soon');
}

/** Submit for approval (instructor only: draft/coming_soon → pending_approval) */
export async function submit(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (row.poster_type !== 'instructor') return err(res, 'Only instructor podcasts need approval', 400);
  if (!['draft', 'coming_soon'].includes(row.status)) return err(res, 'Only draft or coming_soon podcasts can be submitted', 400);
  if (!row.video_url && !row.youtube_url) return err(res, 'Video or YouTube URL is required before submission', 400);

  const { data, error: e } = await supabase.from(TABLE)
    .update({ status: 'pending_approval' })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_submitted', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast submitted for approval');
}

/** Approve (admin: pending_approval → published for instructor podcasts) */
export async function approve(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (row.status !== 'pending_approval') return err(res, 'Only pending podcasts can be approved', 400);

  const { data, error: e } = await supabase.from(TABLE)
    .update({
      status: 'published',
      verified_at: new Date().toISOString(),
      verified_by: req.user!.id,
      published_at: row.published_at || new Date().toISOString(),
    })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_approved', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast approved and published');
}

/** Reject (admin: pending_approval → draft) */
export async function reject(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (row.status !== 'pending_approval') return err(res, 'Only pending podcasts can be rejected', 400);

  const { data, error: e } = await supabase.from(TABLE)
    .update({ status: 'draft', verified_at: null, verified_by: null })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_rejected', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast rejected');
}

/** Publish directly (system podcasts: draft/coming_soon → published, no approval needed) */
export async function publish(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);

  // Instructor podcasts must go through approval flow
  if (row.poster_type === 'instructor') return err(res, 'Instructor podcasts must be submitted for approval', 400);
  if (!['draft', 'coming_soon'].includes(row.status)) return err(res, 'Only draft or coming_soon podcasts can be published', 400);
  if (!row.video_url && !row.youtube_url) return err(res, 'Video or YouTube URL is required before publishing', 400);

  const { data, error: e } = await supabase.from(TABLE)
    .update({
      status: 'published',
      published_at: row.published_at || new Date().toISOString(),
      verified_at: new Date().toISOString(),
      verified_by: req.user!.id,
    })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_published', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast published');
}

/** Archive (published → archived) */
export async function archive(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);
  if (row.status !== 'published') return err(res, 'Only published podcasts can be archived', 400);

  const { data, error: e } = await supabase.from(TABLE)
    .update({ status: 'archived' })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_archived', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast archived');
}


// ══════════════════════════════════════════════════════════════
// SOFT DELETE / RESTORE / HARD DELETE
// ══════════════════════════════════════════════════════════════

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('title').eq('id', id).is('deleted_at', null).single();
  if (!row) return err(res, 'Podcast not found', 404);
  const { data, error: e } = await supabase.from(TABLE)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_soft_deleted', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast soft-deleted');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('title').eq('id', id).not('deleted_at', 'is', null).single();
  if (!row) return err(res, 'Podcast not found or not deleted', 404);
  const { data, error: e } = await supabase.from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_restored', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, data, 'Podcast restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!row) return err(res, 'Podcast not found', 404);

  // Clean up Bunny assets
  const guid = row.video_id || extractBunnyVideoGuid(row.video_url);
  if (guid) { try { await deleteVideoFromStream(guid); } catch {} }
  if (row.thumbnail_url && config.bunny.cdnUrl && row.thumbnail_url.startsWith(config.bunny.cdnUrl)) {
    try { await deleteImage(extractBunnyPath(row.thumbnail_url), row.thumbnail_url); } catch {}
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'podcast_deleted', targetType: TABLE, targetId: id, targetName: row.title, ip: getClientIp(req) });
  return ok(res, null, 'Podcast permanently deleted');
}
