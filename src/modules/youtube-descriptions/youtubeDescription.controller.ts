import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

/**
 * List youtube descriptions with optional filters.
 * Supports filtering by sub_topic_id, topic_id, chapter_id, subject_id.
 */
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase
    .from('youtube_descriptions')
    .select(`
      *,
      sub_topics!inner(id, slug, display_order, topic_id,
        topics!inner(id, slug, chapter_id,
          chapters!inner(id, slug, subject_id,
            subjects!inner(id, slug, code)
          )
        )
      )
    `, { count: 'exact' });

  // Filters
  if (req.query.sub_topic_id) {
    q = q.eq('sub_topic_id', parseInt(req.query.sub_topic_id as string));
  } else if (req.query.topic_id) {
    q = q.eq('sub_topics.topic_id', parseInt(req.query.topic_id as string));
  } else if (req.query.chapter_id) {
    q = q.eq('sub_topics.topics.chapter_id', parseInt(req.query.chapter_id as string));
  } else if (req.query.subject_id) {
    q = q.eq('sub_topics.topics.chapters.subject_id', parseInt(req.query.subject_id as string));
  }

  if (search) {
    q = q.or(`video_title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  return paginated(res, data || [], count || 0, page, limit);
}

/**
 * Get a single youtube description by ID.
 */
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('youtube_descriptions')
    .select(`
      *,
      sub_topics(id, slug, display_order, topic_id,
        topics(id, slug, chapter_id,
          chapters(id, slug, subject_id,
            subjects(id, slug, code)
          )
        )
      )
    `)
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'YouTube description not found', 404);
  return ok(res, data);
}

/**
 * Get youtube description by sub_topic_id.
 */
export async function getBySubTopicId(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('youtube_descriptions')
    .select('*')
    .eq('sub_topic_id', parseInt(req.params.subTopicId as string))
    .single();
  if (e || !data) return err(res, 'YouTube description not found for this sub-topic', 404);
  return ok(res, data);
}

/**
 * Update a youtube description (manual edit).
 */
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { video_title, description } = req.body;

  const updates: any = { updated_at: new Date().toISOString() };
  if (video_title !== undefined) updates.video_title = video_title;
  if (description !== undefined) updates.description = description;

  const { data, error: e } = await supabase
    .from('youtube_descriptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);
  if (!data) return err(res, 'YouTube description not found', 404);

  logAdmin({
    actorId: req.user!.id,
    action: 'youtube_description_updated',
    targetType: 'youtube_description',
    targetId: id,
    ip: getClientIp(req),
  });

  return ok(res, data, 'YouTube description updated');
}

/**
 * Delete a youtube description.
 */
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { error: e } = await supabase.from('youtube_descriptions').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  logAdmin({
    actorId: req.user!.id,
    action: 'youtube_description_deleted',
    targetType: 'youtube_description',
    targetId: id,
    ip: getClientIp(req),
  });

  return ok(res, null, 'YouTube description deleted');
}

/**
 * Bulk delete youtube descriptions by IDs.
 */
export async function bulkDelete(req: Request, res: Response) {
  const ids: number[] = req.body.ids;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return err(res, 'No IDs provided', 400);
  }

  const { error: e, count } = await supabase
    .from('youtube_descriptions')
    .delete()
    .in('id', ids);
  if (e) return err(res, e.message, 500);

  logAdmin({
    actorId: req.user!.id,
    action: 'youtube_descriptions_bulk_deleted',
    targetType: 'youtube_description',
    targetId: 0,
    targetName: `Bulk deleted ${count ?? ids.length} YouTube descriptions`,
    ip: getClientIp(req),
    metadata: { ids, count: count ?? ids.length },
  });

  return ok(res, { deleted: count ?? ids.length }, `Deleted ${count ?? ids.length} YouTube description(s)`);
}
