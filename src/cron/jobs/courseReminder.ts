import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

/**
 * Course Reminder Job
 * ───────────────────
 * Runs weekly on Monday at 9:00 AM.
 * Finds active enrollments where:
 *   - progress_pct < 100
 *   - last_accessed_at is older than 7 days (or null)
 *   - enrollment is still active and not expired
 * Sends a gentle "come back and continue" reminder.
 */
export async function runCourseReminder(): Promise<{ reminded: number; skipped: number }> {
  let reminded = 0;
  let skipped = 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find enrollments that have gone stale (not accessed in 7+ days, not completed)
  const { data: stale, error: err } = await supabase
    .from('enrollments')
    .select('id, user_id, course_id, progress_pct, last_accessed_at')
    .eq('enrollment_status', 'active')
    .eq('is_active', true)
    .lt('progress_pct', 100)
    .is('deleted_at', null)
    .or(`last_accessed_at.is.null,last_accessed_at.lt.${sevenDaysAgo}`)
    .limit(500);

  if (err) {
    logger.error({ err: err.message }, '[Cron:CourseReminder] Enrollment query failed');
    return { reminded: 0, skipped: 0 };
  }

  if (!stale || stale.length === 0) {
    logger.debug('[Cron:CourseReminder] No stale enrollments found');
    return { reminded: 0, skipped: 0 };
  }

  // Get course titles for personalized messages
  const courseIds = [...new Set(stale.map((e: any) => e.course_id).filter(Boolean))];
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title')
    .in('id', courseIds);

  const courseMap = new Map<number, string>();
  for (const c of courses || []) {
    courseMap.set(c.id, c.title);
  }

  // Check user preferences — skip users who opted out of reminders
  const userIds = [...new Set(stale.map((e: any) => e.user_id))];
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('user_id, email_enabled')
    .in('user_id', userIds)
    .eq('notification_type', 'course_reminder')
    .is('deleted_at', null);

  const optedOut = new Set<number>();
  for (const p of prefs || []) {
    if (p.email_enabled === false) optedOut.add(p.user_id);
  }

  // Dedup: only one reminder per user per week (check if we already sent one in last 6 days)
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentReminders } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('notification_type', 'course_reminder')
    .gte('created_at', sixDaysAgo)
    .in('user_id', userIds)
    .is('deleted_at', null);

  const alreadyReminded = new Set<number>();
  for (const r of recentReminders || []) {
    alreadyReminded.add(r.user_id);
  }

  for (const enrollment of stale) {
    if (optedOut.has(enrollment.user_id)) {
      skipped++;
      continue;
    }

    if (alreadyReminded.has(enrollment.user_id)) {
      skipped++;
      continue;
    }

    const courseTitle = courseMap.get(enrollment.course_id) || 'your course';
    const progress = parseFloat(enrollment.progress_pct || 0);

    try {
      await sendNotification({
        userId: enrollment.user_id,
        notificationType: 'course_reminder',
        title: 'Continue Your Learning Journey',
        message: `You're ${progress.toFixed(0)}% through "${courseTitle}". Pick up where you left off!`,
        channels: ['in_app', 'email'],
        referenceType: 'enrollment',
        referenceId: enrollment.id,
        metadata: { course_id: enrollment.course_id, progress_pct: progress },
      });
      reminded++;
      // Mark this user as reminded so we skip their other stale enrollments
      alreadyReminded.add(enrollment.user_id);
    } catch { /* skip */ }
  }

  logger.info({ reminded, skipped, staleEnrollments: stale.length }, '[Cron:CourseReminder] Completed');
  return { reminded, skipped };
}
