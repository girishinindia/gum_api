import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

/**
 * Enrollment Expiry Job
 * ─────────────────────
 * Runs hourly. Finds active enrollments past their expires_at
 * and transitions them to 'expired'.
 */
export async function runEnrollmentExpiry(): Promise<{ expired: number; warned: number }> {
  const now = new Date().toISOString();
  let expired = 0;
  let warned = 0;

  // ── 1. Expire overdue enrollments ──
  const { data: overdue, error: err1 } = await supabase
    .from('enrollments')
    .select('id, user_id, course_id, expires_at')
    .eq('enrollment_status', 'active')
    .eq('is_active', true)
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .is('deleted_at', null)
    .limit(500);

  if (err1) {
    logger.error({ err: err1.message }, '[Cron:EnrollmentExpiry] Query failed');
    return { expired: 0, warned: 0 };
  }

  if (overdue && overdue.length > 0) {
    const ids = overdue.map((e: any) => e.id);

    const { error: updateErr } = await supabase
      .from('enrollments')
      .update({ enrollment_status: 'expired', is_active: false })
      .in('id', ids);

    if (updateErr) {
      logger.error({ err: updateErr.message }, '[Cron:EnrollmentExpiry] Update failed');
    } else {
      expired = ids.length;

      // Notify each user
      for (const enrollment of overdue) {
        try {
          await sendNotification({
            userId: enrollment.user_id,
            notificationType: 'enrollment_expired',
            title: 'Enrollment Expired',
            message: 'Your course enrollment has expired. Please re-enroll to continue learning.',
            channels: ['in_app', 'email'],
            referenceType: 'enrollment',
            referenceId: enrollment.id,
          });
        } catch { /* notification failure shouldn't block job */ }
      }
    }
  }

  // ── 2. Warn enrollments expiring within 7 days ──
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiringSoon } = await supabase
    .from('enrollments')
    .select('id, user_id, course_id, expires_at')
    .eq('enrollment_status', 'active')
    .eq('is_active', true)
    .not('expires_at', 'is', null)
    .gt('expires_at', now)
    .lt('expires_at', sevenDaysFromNow)
    .is('deleted_at', null)
    .limit(500);

  if (expiringSoon && expiringSoon.length > 0) {
    for (const enrollment of expiringSoon) {
      try {
        // Only warn once — check if we already sent a warning (via metadata)
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', enrollment.user_id)
          .eq('notification_type', 'enrollment_expiring_soon')
          .eq('reference_type', 'enrollment')
          .eq('reference_id', enrollment.id)
          .maybeSingle();

        if (!existing) {
          await sendNotification({
            userId: enrollment.user_id,
            notificationType: 'enrollment_expiring_soon',
            title: 'Enrollment Expiring Soon',
            message: 'Your course enrollment is expiring soon. Complete your coursework before it expires.',
            channels: ['in_app', 'email'],
            referenceType: 'enrollment',
            referenceId: enrollment.id,
          });
          warned++;
        }
      } catch { /* skip */ }
    }
  }

  logger.info({ expired, warned }, '[Cron:EnrollmentExpiry] Completed');
  return { expired, warned };
}
