import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Announcement Lifecycle Job
 * ──────────────────────────
 * Runs every 5 minutes.
 * - Auto-publishes drafts whose publish_at has passed.
 * - Auto-expires published announcements whose expires_at has passed.
 */
export async function runAnnouncementLifecycle(): Promise<{ published: number; expired: number }> {
  const now = new Date().toISOString();
  let published = 0;
  let expired = 0;

  // ── 1. Auto-publish scheduled drafts ──
  const { data: toPublish, error: err1 } = await supabase
    .from('announcements')
    .select('id, title')
    .eq('status', 'draft')
    .not('publish_at', 'is', null)
    .lte('publish_at', now)
    .is('deleted_at', null)
    .limit(100);

  if (err1) {
    logger.error({ err: err1.message }, '[Cron:Announcement] Publish query failed');
  } else if (toPublish && toPublish.length > 0) {
    const ids = toPublish.map((a: any) => a.id);
    const { error: updateErr } = await supabase
      .from('announcements')
      .update({ status: 'published' })
      .in('id', ids);

    if (updateErr) {
      logger.error({ err: updateErr.message }, '[Cron:Announcement] Publish update failed');
    } else {
      published = ids.length;
    }
  }

  // ── 2. Auto-expire published announcements ──
  const { data: toExpire, error: err2 } = await supabase
    .from('announcements')
    .select('id, title')
    .eq('status', 'published')
    .not('expires_at', 'is', null)
    .lte('expires_at', now)
    .is('deleted_at', null)
    .limit(100);

  if (err2) {
    logger.error({ err: err2.message }, '[Cron:Announcement] Expire query failed');
  } else if (toExpire && toExpire.length > 0) {
    const ids = toExpire.map((a: any) => a.id);
    const { error: updateErr } = await supabase
      .from('announcements')
      .update({ status: 'expired' })
      .in('id', ids);

    if (updateErr) {
      logger.error({ err: updateErr.message }, '[Cron:Announcement] Expire update failed');
    } else {
      expired = ids.length;
    }
  }

  if (published > 0 || expired > 0) {
    logger.info({ published, expired }, '[Cron:Announcement] Completed');
  }
  return { published, expired };
}
