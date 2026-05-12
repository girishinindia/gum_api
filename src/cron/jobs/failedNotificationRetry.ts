import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

/**
 * Failed Notification Retry Job
 * ─────────────────────────────
 * Runs every hour.
 * Finds notifications with delivery_status = 'failed' and retries
 * sending them (up to 3 attempts). Retry count is tracked in
 * the metadata JSONB field as metadata.retry_count.
 */
const MAX_RETRIES = 3;

export async function runFailedNotificationRetry(): Promise<{ retried: number; abandoned: number }> {
  let retried = 0;
  let abandoned = 0;

  // Find failed notifications that haven't exceeded max retries
  const { data: failed, error: err } = await supabase
    .from('notifications')
    .select('id, user_id, notification_type, title, message, channel, metadata, reference_type, reference_id')
    .eq('delivery_status', 'failed')
    .is('deleted_at', null)
    .limit(100);

  if (err) {
    logger.error({ err: err.message }, '[Cron:NotifRetry] Query failed');
    return { retried: 0, abandoned: 0 };
  }

  if (!failed || failed.length === 0) {
    logger.debug('[Cron:NotifRetry] No failed notifications to retry');
    return { retried: 0, abandoned: 0 };
  }

  for (const notif of failed) {
    const meta = (notif.metadata as Record<string, any>) || {};
    const retryCount = meta.retry_count || 0;

    if (retryCount >= MAX_RETRIES) {
      // Mark as permanently failed — stop retrying
      await supabase
        .from('notifications')
        .update({
          delivery_status: 'permanently_failed',
          metadata: { ...meta, retry_count: retryCount, abandoned_at: new Date().toISOString() },
        })
        .eq('id', notif.id);
      abandoned++;
      continue;
    }

    try {
      // Re-send via the notification service
      await sendNotification({
        userId: notif.user_id,
        notificationType: notif.notification_type,
        title: notif.title || 'Notification',
        message: notif.message || '',
        channels: [notif.channel],
        referenceType: notif.reference_type || undefined,
        referenceId: notif.reference_id || undefined,
        metadata: { ...meta, retry_of: notif.id, retry_count: retryCount + 1 },
      });

      // Mark original as superseded
      await supabase
        .from('notifications')
        .update({
          delivery_status: 'retried',
          metadata: { ...meta, retry_count: retryCount + 1, retried_at: new Date().toISOString() },
        })
        .eq('id', notif.id);

      retried++;
    } catch (e: any) {
      // Increment retry count on the original so we track the attempt
      await supabase
        .from('notifications')
        .update({
          metadata: { ...meta, retry_count: retryCount + 1, last_retry_error: e.message },
        })
        .eq('id', notif.id);

      logger.error({ err: e.message, notifId: notif.id }, '[Cron:NotifRetry] Retry failed');
    }
  }

  logger.info({ retried, abandoned, total: failed.length }, '[Cron:NotifRetry] Completed');
  return { retried, abandoned };
}
