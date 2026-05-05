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

const TABLE = 'assesment_capstone_projects_solution';
const PARENT_TABLE = 'assesment_capstone_projects';
const CACHE_KEY = 'assesment_capstone_projects_solution:all';

const clearCache = async (capstoneProjectId?: number) => {
  await redis.del(CACHE_KEY);
  if (capstoneProjectId) await redis.del(`assesment_capstone_projects_solution:project:${capstoneProjectId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.capstone_project_id === 'string') body.capstone_project_id = parseInt(body.capstone_project_id) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, ${PARENT_TABLE}!assesment_capstone_projects_solution_capstone_project_id_fkey(slug, course_id)`;

/**
 * Build a Bunny Stream collection name for a capstone project.
 * Format: "capstone-project/<course-slug>/<project-slug>"
 */
async function getCollectionName(capstoneProjectId: number): Promise<string | null> {
  const { data: project } = await supabase
    .from(PARENT_TABLE)
    .select('slug, course_id, courses(slug)')
    .eq('id', capstoneProjectId)
    .single();
  if (!project || !(project as any).courses) return null;
  const course = (project as any).courses as any;
  return `capstone-project/${course.slug}/${project.slug}`;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.ilike('video_title', `%${search}%`);
  if (req.query.capstone_project_id) q = q.eq('capstone_project_id', parseInt(req.query.capstone_project_id as string));
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
  if (e || !data) return err(res, 'Capstone project solution not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const videoFile = files?.video_file?.[0];
  const thumbnailFile = files?.thumbnail_file?.[0];

  // Verify parent exists
  const { data: project } = await supabase.from(PARENT_TABLE).select('id, slug, course_id').eq('id', body.capstone_project_id).single();
  if (!project) return err(res, 'Capstone project not found', 404);

  // If video file uploaded, upload to Bunny Stream
  if (videoFile) {
    const collName = await getCollectionName(body.capstone_project_id);
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

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.capstone_project_id);
  logAdmin({ actorId: req.user!.id, action: 'capstone_project_solution_created', targetType: 'capstone_project_solution', targetId: data.id, targetName: body.video_title || `solution:${body.capstone_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Capstone project solution created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Capstone project solution not found', 404);

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

    const capstoneProjectId = updates.capstone_project_id || old.capstone_project_id;
    const collName = await getCollectionName(capstoneProjectId);
    let collectionId: string | undefined;
    if (collName) {
      collectionId = await findOrCreateCollection(collName);
    }
    const title = updates.video_title || old.video_title || 'solution-video';
    const result = await uploadVideoToStream(videoFile.buffer, title, collectionId);
    updates.video = result.embedUrl;
    updates.video_thumbnail = result.thumbnailUrl;
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

  await clearCache(old.capstone_project_id);
  logAdmin({ actorId: req.user!.id, action: 'capstone_project_solution_updated', targetType: 'capstone_project_solution', targetId: id, targetName: updates.video_title || old.video_title || `solution:${old.capstone_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Capstone project solution updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('capstone_project_id, video_title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Capstone project solution not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.capstone_project_id);
  logAdmin({ actorId: req.user!.id, action: 'capstone_project_solution_soft_deleted', targetType: 'capstone_project_solution', targetId: id, targetName: old.video_title || `solution:${old.capstone_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Capstone project solution moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('capstone_project_id, video_title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Capstone project solution not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.capstone_project_id);
  logAdmin({ actorId: req.user!.id, action: 'capstone_project_solution_restored', targetType: 'capstone_project_solution', targetId: id, targetName: old.video_title || `solution:${old.capstone_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Capstone project solution restored');
}

/**
 * Bulk upload multiple solution videos at once.
 */
export async function bulkUpload(req: Request, res: Response) {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) return err(res, 'No video files provided', 400);

  const capstoneProjectId = parseInt(req.body.capstone_project_id);
  if (!capstoneProjectId) return err(res, 'capstone_project_id is required', 400);

  // Verify parent exists
  const { data: project } = await supabase.from(PARENT_TABLE).select('id, slug, course_id').eq('id', capstoneProjectId).single();
  if (!project) return err(res, 'Capstone project not found', 404);

  // Parse titles array
  let titles: string[] = [];
  try {
    titles = req.body.titles ? JSON.parse(req.body.titles) : [];
  } catch { titles = []; }

  const videoShortIntro = req.body.video_short_intro || null;

  // Get collection
  const collName = await getCollectionName(capstoneProjectId);
  let collectionId: string | undefined;
  if (collName) {
    collectionId = await findOrCreateCollection(collName);
  }

  // Get current max display_order
  const { data: maxOrderRow } = await supabase.from(TABLE).select('display_order').eq('capstone_project_id', capstoneProjectId).order('display_order', { ascending: false }).limit(1).single();
  let nextOrder = (maxOrderRow?.display_order || 0) + 1;

  const results: any[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const title = titles[i] || file.originalname.replace(/\.[^/.]+$/, '') || `solution-video-${i + 1}`;

    try {
      const uploadResult = await uploadVideoToStream(file.buffer, title, collectionId);

      const record: any = {
        capstone_project_id: capstoneProjectId,
        video: uploadResult.embedUrl,
        video_thumbnail: uploadResult.thumbnailUrl,
        video_title: title,
        video_short_intro: videoShortIntro,
        display_order: nextOrder++,
        is_active: true,
        created_by: req.user!.id,
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

  await clearCache(capstoneProjectId);
  logAdmin({ actorId: req.user!.id, action: 'capstone_project_solutions_bulk_uploaded', targetType: 'capstone_project_solution', targetId: capstoneProjectId, targetName: `${results.length} videos uploaded`, ip: getClientIp(req) });

  return ok(res, { uploaded: results, errors }, `${results.length} of ${files.length} videos uploaded successfully`, 201);
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('capstone_project_id, video, video_title').eq('id', id).single();
  if (!old) return err(res, 'Capstone project solution not found', 404);

  // Delete video from Bunny Stream
  if (old.video) {
    const guidMatch = old.video.match(/\/embed\/[^/]+\/([^/?]+)/);
    if (guidMatch) {
      try { await deleteVideoFromStream(guidMatch[1]); } catch (_) {}
    }
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.capstone_project_id);
  logAdmin({ actorId: req.user!.id, action: 'capstone_project_solution_deleted', targetType: 'capstone_project_solution', targetId: id, targetName: old.video_title || `solution:${old.capstone_project_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Capstone project solution permanently deleted');
}
