import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

/**
 * Daily Notification Digest Job
 * ─────────────────────────────
 * Runs daily at 8:00 AM.
 * Finds users with unread in-app notifications from the last 24 hours
 * and sends a single digest email summarizing them.
 */
export async function runNotificationDigest(): Promise<{ usersSent: number; totalUnread: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let usersSent = 0;
  let totalUnread = 0;

  // Find distinct users with unread in-app notifications from last 24h
  const { data: unreadByUser, error: err } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('channel', 'in_app')
    .eq('is_read', false)
    .gte('created_at', since)
    .is('deleted_at', null)
    .limit(1000);

  if (err) {
    logger.error({ err: err.message }, '[Cron:Digest] Query failed');
    return { usersSent: 0, totalUnread: 0 };
  }

  if (!unreadByUser || unreadByUser.length === 0) {
    logger.debug('[Cron:Digest] No unread notifications to digest');
    return { usersSent: 0, totalUnread: 0 };
  }

  // Group by user_id and count
  const userCounts = new Map<number, number>();
  for (const n of unreadByUser) {
    userCounts.set(n.user_id, (userCounts.get(n.user_id) || 0) + 1);
  }

  totalUnread = unreadByUser.length;

  for (const [userId, count] of userCounts) {
    // Only send digest if user has 2+ unread (don't spam for 1 notification)
    if (count < 2) continue;

    // Check user email preference for digests
    // BUG-60/BUG-62: notification_preferences has no deleted_at column; the
    // phantom filter errored the query so the opt-out below never fired and
    // digests were emailed to users who disabled them. Drop the filter.
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', userId)
      .eq('notification_type', 'digest')
      .maybeSingle();

    // If explicit preference exists and email is disabled, skip
    if (pref && pref.email_enabled === false) continue;

    // Get a summary of what the notifications are about
    const { data: recent } = await supabase
      .from('notifications')
      .select('title, notification_type')
      .eq('user_id', userId)
      .eq('channel', 'in_app')
      .eq('is_read', false)
      .gte('created_at', since)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    const summaryItems = (recent || []).map((n: any) => n.title).join(', ');
    const moreCount = count > 5 ? ` and ${count - 5} more` : '';

    try {
      await sendNotification({
        userId,
        notificationType: 'digest',
        title: `You have ${count} unread notifications`,
        message: `Here's what you missed: ${summaryItems}${moreCount}. Log in to catch up!`,
        channels: ['email'],
        metadata: { digest_count: count, period: '24h' },
      });
      usersSent++;
    } catch { /* skip */ }
  }

  logger.info({ usersSent, totalUnread, uniqueUsers: userCounts.size }, '[Cron:Digest] Completed');
  return { usersSent, totalUnread };
}
