import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getVideoStatus } from '../../services/video.service';

/**
 * Video Status Poll Job
 * ─────────────────────
 * Runs every 10 minutes.
 *
 * Safety net for the Bunny Stream webhook (/api/v1/webhooks/bunny-stream):
 * in environments where Bunny cannot reach the API (local dev — APP_URL is
 * localhost) or when a webhook delivery is missed, this job polls Bunny for
 * every sub_topic whose video is still in a non-terminal encoding state and
 * reconciles `video_status` (+ thumbnail on finish).
 *
 * Bunny status codes: 0 created · 1 uploaded · 2 processing · 3 transcoding
 *                     4 finished(ready) · 5 error · 6 upload_failed
 */

const STATUS_TO_TEXT: Record<number, string> = {
  0: 'created',
  1: 'uploaded',
  2: 'processing',
  3: 'transcoding',
  4: 'ready',
  5: 'error',
  6: 'upload_failed',
};

const TERMINAL = new Set(['ready', 'error', 'upload_failed']);
const BATCH_LIMIT = 50;

export async function runVideoStatusPoll(): Promise<{
  checked: number;
  updated: number;
  failures: number;
}> {
  // Pull candidate Bunny-backed videos; JS-filters keep the PostgREST query simple
  // and NULL-safe (video_status can be NULL right after upload).
  const { data: rows, error: err } = await supabase
    .from('sub_topics')
    .select('id, video_id, video_status, video_source')
    .not('video_id', 'is', null)
    .in('video_source', ['bunny', 'bunny_pending'])
    .is('deleted_at', null)
    .limit(500);

  if (err) {
    logger.error({ err: err.message }, '[Cron:VideoPoll] Candidate query failed');
    return { checked: 0, updated: 0, failures: 1 };
  }

  const pending = (rows || [])
    .filter(r => r.video_id && !TERMINAL.has(String(r.video_status || '')))
    .slice(0, BATCH_LIMIT);

  if (pending.length === 0) {
    logger.debug('[Cron:VideoPoll] No pending videos');
    return { checked: 0, updated: 0, failures: 0 };
  }

  let updated = 0;
  let failures = 0;

  for (const row of pending) {
    try {
      const video = await getVideoStatus(row.video_id);
      const statusCode = Number(video?.status ?? -1);
      const newStatus = STATUS_TO_TEXT[statusCode];
      if (!newStatus) continue; // unknown code — leave untouched

      if (newStatus === String(row.video_status || '')) continue; // no change

      const updates: Record<string, any> = { video_status: newStatus };
      if (statusCode === 4 /* finished */) {
        const streamCdn = (config.bunny.streamCdn || '').replace(/\/+$/, '');
        if (streamCdn) updates.video_thumbnail_url = `${streamCdn}/${row.video_id}/thumbnail.jpg`;
        if (row.video_source === 'bunny_pending') updates.video_source = 'bunny';
      }

      const { error: updErr } = await supabase
        .from('sub_topics')
        .update(updates)
        .eq('id', row.id);

      if (updErr) {
        failures++;
        logger.error(
          { err: updErr.message, subTopicId: row.id },
          '[Cron:VideoPoll] sub_topic update failed',
        );
      } else {
        updated++;
        logger.info(
          { subTopicId: row.id, videoId: row.video_id, from: row.video_status, to: newStatus },
          '[Cron:VideoPoll] Status reconciled',
        );
      }
    } catch (e: any) {
      failures++;
      logger.warn(
        { err: e?.message, videoId: row.video_id, subTopicId: row.id },
        '[Cron:VideoPoll] Bunny lookup failed',
      );
    }
  }

  logger.info({ checked: pending.length, updated, failures }, '[Cron:VideoPoll] Completed');
  return { checked: pending.length, updated, failures };
}
