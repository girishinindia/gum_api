import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Old Notification Cleanup Job
 * ────────────────────────────
 * Runs daily at 6:00 AM.
 * Soft-deletes read notifications older than 90 days and
 * permanently failed notifications older than 30 days.
 * Keeps the notifications table manageable.
 */
const READ_RETENTION_DAYS = 90;
const FAILED_RETENTION_DAYS = 30;

export async function runOldNotificationCleanup(): Promise<{ readCleaned: number; failedCleaned: number }> {
  const now = new Date().toISOString();
  let readCleaned = 0;
  let failedCleaned = 0;

  // 1. Soft-delete old read notifications (90+ days)
  const readCutoff = new Date(Date.now() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldRead, error: err1 } = await supabase
    .from('notifications')
    .update({ deleted_at: now, is_active: false })
    .eq('is_read', true)
    .is('deleted_at', null)
    .lt('created_at', readCutoff)
    .select('id');

  if (err1) {
    logger.error({ err: err1.message }, '[Cron:NotifCleanup] Read cleanup failed');
  } else {
    readCleaned = oldRead?.length || 0;
  }

  // 2. Soft-delete permanently failed notifications (30+ days)
  const failedCutoff = new Date(Date.now() - FAILED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldFailed, error: err2 } = await supabase
    .from('notifications')
    .update({ deleted_at: now, is_active: false })
    .in('delivery_status', ['permanently_failed', 'retried'])
    .is('deleted_at', null)
    .lt('created_at', failedCutoff)
    .select('id');

  if (err2) {
    logger.error({ err: err2.message }, '[Cron:NotifCleanup] Failed cleanup error');
  } else {
    failedCleaned = oldFailed?.length || 0;
  }

  if (readCleaned > 0 || failedCleaned > 0) {
    logger.info({ readCleaned, failedCleaned }, '[Cron:NotifCleanup] Completed');
  } else {
    logger.debug('[Cron:NotifCleanup] Nothing to clean up');
  }

  return { readCleaned, failedCleaned };
}
