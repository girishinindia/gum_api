import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { config } from '../../config';
import { uploadVideoToStream, findOrCreateCollection, deleteVideoFromStream } from '../../services/video.service';
import { processAndUploadImage } from '../../services/storage.service';

const TABLE = 'assesment_mini_projects_solution';
const PARENT_TABLE = 'assesment_mini_projects';
const CACHE_KEY = 'assesment_mini_projects_solution:all';

const clearCache = async (miniProjectId?: number) => {
  await redis.del(CACHE_KEY);
  if (miniProjectId) await redis.del(`assesment_mini_projects_solution:project:${miniProjectId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.mini_project_id === 'string') body.mini_project_id = parseInt(body.mini_project_id) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, ${PARENT_TABLE}!assesment_mini_projects_solution_mini_project_id_fkey(slug, chapter_id)`;

/**
 * Build a Bunny Stream collection name for a mini project.
 * Format: "mini-project/<chapter-slug>/<project-slug>"
 */
async function getCollectionName(miniProjectId: number): Promise<string | null> {
  const { data: project } = await supabase
    .from(PARENT_TABLE)
    .select('slug, chapter_id, chapters(slug)')
    .eq('id', miniProjectId)
    .single();
  if (!project || !(project as any).chapters) return null;
  const chapter = (project as any).chapters as any;
  return `mini-project/${chapter.slug}/${project.slug}`;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.ilike('video_title', `%${search}%`);
  if (req.query.mini_project_id) q = q.eq('mini_project_id', parseInt(req.query.mini_project_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Mini project solution not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const videoFile = files?.video_file?.[0];
  const thumbnailFile = files?.thumbnail_file?.[0];

  // Verify parent exists
  const { data: project } = await supabase.from(PARENT_TABLE).select('id, slug, chapter_id').eq('id', body.mini_project_id).single();
  if (!project) return err(res, 'Mini project not found', 404);

  // If video file uploaded, upload to Bunny Stream
  if (videoFile) {
    const collName = await getCollectionName(body.mini_project_id);
    let collectionId: string | undefined;
    if (collName) {
      collectionId = await findOrCreateCollection(collName);
    }
    const title = body.video_title || project.slug || 'solution-video';
    const result = await uploadVideoToStream(videoFile.buffer, title, collectionId);
    body.video = result.embedUrl;
    body.video_thumbnail = result.thumbnailUrl;
  }

  // If custom thumbnail uploaded, upload to CDN (overrides auto-generated one)
  if (thumbnailFile) {
    const slug = body.video_title || project.slug || 'solution';
    const thumbPath = `thumbnails/solutions/${slug}-${Date.now()}.webp`;
    body.video_thumbnail = await processAndUploadImage(thumbnailFile.buffer, thumbPath, { width: 480, height: 270, quality: 85 });
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_solution_created', targetType: 'mini_project_solution', targetId: data.id, targetName: body.video_title || `solution:${body.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project solution created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Mini project solution not found', 404);

  const updates = parseBody(req);
  const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const videoFile = files?.video_file?.[0];
  const thumbnailFile = files?.thumbnail_file?.[0];

  // If new video file uploaded, delete old and upload new
  if (videoFile) {
    // Try to delete old video from Bunny Stream
    if (old.video) {
      const guidMatch = old.video.match(/\/embed\/[^/]+\/([^/?]+)/);
      if (guidMatch) {
        try { await deleteVideoFromStream(guidMatch[1]); } catch (_) {}
      }
    }

    const miniProjectId = updates.mini_project_id || old.mini_project_id;
    const collName = await getCollectionName(miniProjectId);
    let collectionId: string | undefined;
    if (collName) {
      collectionId = await findOrCreateCollection(collName);
    }
    const title = updates.video_title || old.video_title || 'solution-video';
    const result = await uploadVideoToStream(videoFile.buffer, title, collectionId);
    updates.video = result.embedUrl;
    // Only set auto-generated thumbnail if no custom thumbnail is being uploaded alongside
    // and no existing custom thumbnail exists (custom ones are in /thumbnails/ path)
    const hasCustomThumbExisting = old.video_thumbnail && old.video_thumbnail.includes('/thumbnails/');
    if (!thumbnailFile && hasCustomThumbExisting) {
      // Preserve existing custom thumbnail — don't overwrite with auto-generated one
    } else {
      updates.video_thumbnail = result.thumbnailUrl;
    }
  }

  // If custom thumbnail uploaded, upload to CDN (overrides auto-generated one)
  if (thumbnailFile) {
    const slug = updates.video_title || old.video_title || 'solution';
    const thumbPath = `thumbnails/solutions/${slug}-${Date.now()}.webp`;
    updates.video_thumbnail = await processAndUploadImage(thumbnailFile.buffer, thumbPath, { width: 480, height: 270, quality: 85 });
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0 && !videoFile && !thumbnailFile) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_solution_updated', targetType: 'mini_project_solution', targetId: id, targetName: updates.video_title || old.video_title || `solution:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project solution updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('mini_project_id, video_title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Mini project solution not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_solution_soft_deleted', targetType: 'mini_project_solution', targetId: id, targetName: old.video_title || `solution:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project solution moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('mini_project_id, video_title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Mini project solution not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_solution_restored', targetType: 'mini_project_solution', targetId: id, targetName: old.video_title || `solution:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project solution restored');
}

/**
 * Bulk upload multiple solution videos at once.
 * Expects multipart/form-data with:
 *   - video_files: multiple video files
 *   - mini_project_id: parent project ID
 *   - titles: JSON stringified array of titles (matching file order)
 *   - video_short_intro: optional short intro for all videos
 */
export async function bulkUpload(req: Request, res: Response) {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) return err(res, 'No video files provided', 400);

  const miniProjectId = parseInt(req.body.mini_project_id);
  if (!miniProjectId) return err(res, 'mini_project_id is required', 400);

  // Verify parent exists
  const { data: project } = await supabase.from(PARENT_TABLE).select('id, slug, chapter_id').eq('id', miniProjectId).single();
  if (!project) return err(res, 'Mini project not found', 404);

  // Parse titles array
  let titles: string[] = [];
  try {
    titles = req.body.titles ? JSON.parse(req.body.titles) : [];
  } catch { titles = []; }

  const videoShortIntro = req.body.video_short_intro || null;

  // Get collection
  const collName = await getCollectionName(miniProjectId);
  let collectionId: string | undefined;
  if (collName) {
    collectionId = await findOrCreateCollection(collName);
  }

  // Get current max display_order
  const { data: maxOrderRow } = await supabase.from(TABLE).select('display_order').eq('mini_project_id', miniProjectId).order('display_order', { ascending: false }).limit(1).single();
  let nextOrder = (maxOrderRow?.display_order || 0) + 1;

  const results: any[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Use provided title, fallback to original filename without extension
    const title = titles[i] || file.originalname.replace(/\.[^/.]+$/, '') || `solution-video-${i + 1}`;

    try {
      const uploadResult = await uploadVideoToStream(file.buffer, title, collectionId);

      const record: any = {
        mini_project_id: miniProjectId,
        video: uploadResult.embedUrl,
        video_thumbnail: uploadResult.thumbnailUrl,
        video_title: title,
        video_short_intro: videoShortIntro,
        display_order: nextOrder++,
        is_active: true,
      };

      const { data, error: e } = await supabase.from(TABLE).insert(record).select(FK_SELECT).single();
      if (e) {
        errors.push(`${title}: DB save failed - ${e.message}`);
      } else {
        results.push(data);
      }
    } catch (uploadErr: any) {
      errors.push(`${title}: Upload failed - ${uploadErr.message}`);
    }
  }

  await clearCache(miniProjectId);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_solutions_bulk_uploaded', targetType: 'mini_project_solution', targetId: miniProjectId, targetName: `${results.length} videos uploaded`, ip: getClientIp(req) });

  return ok(res, { uploaded: results, errors }, `${results.length} of ${files.length} videos uploaded successfully`, 201);
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('mini_project_id, video, video_title').eq('id', id).single();
  if (!old) return err(res, 'Mini project solution not found', 404);

  // Delete video from Bunny Stream
  if (old.video) {
    const guidMatch = old.video.match(/\/embed\/[^/]+\/([^/?]+)/);
    if (guidMatch) {
      try { await deleteVideoFromStream(guidMatch[1]); } catch (_) {}
    }
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_solution_deleted', targetType: 'mini_project_solution', targetId: id, targetName: old.video_title || `solution:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Mini project solution permanently deleted');
}
