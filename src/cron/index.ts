import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';
import { withLock } from './lock';
import { runEnrollmentExpiry } from './jobs/enrollmentExpiry';
import { runOrderExpiry } from './jobs/orderExpiry';
import { runAnnouncementLifecycle } from './jobs/announcementLifecycle';
import { runEarningConfirmation } from './jobs/earningConfirmation';
import { runAutoPayout } from './jobs/autoPayout';
import { runInstructorProfileSync } from './jobs/instructorProfileSync';
import { runNotificationDigest } from './jobs/notificationDigest';
import { runCertificateAutoIssue } from './jobs/certificateAutoIssue';
import { runFailedNotificationRetry } from './jobs/failedNotificationRetry';
import { runCourseReminder } from './jobs/courseReminder';
import { runStaleCartCleanup } from './jobs/staleCartCleanup';
import { runCouponDeactivation } from './jobs/couponDeactivation';
import { runOldNotificationCleanup } from './jobs/oldNotificationCleanup';

// ── Types ──
export interface CronJobDef {
  name: string;
  schedule: string;          // cron expression
  description: string;
  handler: () => Promise<any>;
  lockTtl?: number;          // seconds
  enabled: boolean;
}

interface CronJobState {
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  lastResult: any;
  lastDuration: number | null;  // ms
  nextRun: string | null;
  runCount: number;
  errorCount: number;
}

// ── State stored in Redis for persistence across restarts ──
const STATE_KEY = 'cron:state';

async function getState(name: string): Promise<Partial<CronJobState>> {
  const raw = await redis.hget(STATE_KEY, name);
  return raw ? JSON.parse(raw) : {};
}

async function setState(name: string, state: Partial<CronJobState>): Promise<void> {
  const existing = await getState(name);
  await redis.hset(STATE_KEY, name, JSON.stringify({ ...existing, ...state }));
}

// ── Job registry ──
const jobs: CronJobDef[] = [
  {
    name: 'enrollment-expiry',
    schedule: '0 * * * *',           // Every hour at :00
    description: 'Expire enrollments past their expires_at and warn those expiring within 7 days',
    handler: runEnrollmentExpiry,
    lockTtl: 120,
    enabled: true,
  },
  {
    name: 'order-expiry',
    schedule: '15 * * * *',          // Every hour at :15
    description: 'Cancel pending orders past their expires_at',
    handler: runOrderExpiry,
    lockTtl: 60,
    enabled: true,
  },
  {
    name: 'announcement-lifecycle',
    schedule: '*/5 * * * *',         // Every 5 minutes
    description: 'Auto-publish scheduled drafts and expire old announcements',
    handler: runAnnouncementLifecycle,
    lockTtl: 60,
    enabled: true,
  },
  {
    name: 'earning-confirmation',
    schedule: '0 2 * * *',           // Daily at 2:00 AM
    description: 'Confirm pending earnings past the 14-day cooling period',
    handler: runEarningConfirmation,
    lockTtl: 180,
    enabled: true,
  },
  {
    name: 'auto-payout',
    schedule: '0 3 * * *',           // Daily at 3:00 AM
    description: 'Create payout requests for wallets with auto_payout_enabled on their payout_day',
    handler: runAutoPayout,
    lockTtl: 300,
    enabled: true,
  },
  {
    name: 'instructor-profile-sync',
    schedule: '0 4 * * *',           // Daily at 4:00 AM
    description: 'Recalculate instructor total_earnings, pending_earnings, total_paid_out from source tables',
    handler: runInstructorProfileSync,
    lockTtl: 300,
    enabled: true,
  },
  {
    name: 'notification-digest',
    schedule: '0 8 * * *',           // Daily at 8:00 AM
    description: 'Send digest email to users with 2+ unread in-app notifications from the last 24 hours',
    handler: runNotificationDigest,
    lockTtl: 120,
    enabled: true,
  },
  {
    name: 'certificate-auto-issue',
    schedule: '30 * * * *',          // Every hour at :30
    description: 'Auto-issue certificates for completed enrollments with matching templates',
    handler: runCertificateAutoIssue,
    lockTtl: 180,
    enabled: true,
  },
  {
    name: 'failed-notification-retry',
    schedule: '45 * * * *',          // Every hour at :45
    description: 'Retry failed notifications up to 3 times, then mark as permanently failed',
    handler: runFailedNotificationRetry,
    lockTtl: 60,
    enabled: true,
  },
  {
    name: 'course-reminder',
    schedule: '0 9 * * 1',           // Weekly on Monday at 9:00 AM
    description: 'Remind students with stale enrollments (inactive 7+ days, not completed) to continue learning',
    handler: runCourseReminder,
    lockTtl: 300,
    enabled: true,
  },
  {
    name: 'stale-cart-cleanup',
    schedule: '0 5 * * *',           // Daily at 5:00 AM
    description: 'Soft-delete cart items untouched for 30+ days',
    handler: runStaleCartCleanup,
    lockTtl: 60,
    enabled: true,
  },
  {
    name: 'coupon-deactivation',
    schedule: '50 * * * *',          // Every hour at :50
    description: 'Deactivate expired or usage-exhausted coupons',
    handler: runCouponDeactivation,
    lockTtl: 60,
    enabled: true,
  },
  {
    name: 'old-notification-cleanup',
    schedule: '0 6 * * *',           // Daily at 6:00 AM
    description: 'Soft-delete read notifications (90+ days) and permanently failed notifications (30+ days)',
    handler: runOldNotificationCleanup,
    lockTtl: 120,
    enabled: true,
  },
];

const scheduledTasks: Map<string, ScheduledTask> = new Map();

/**
 * Initialize all cron jobs. Called once from server.ts after boot.
 */
export function initCronJobs(): void {
  for (const job of jobs) {
    if (!job.enabled) {
      logger.info({ name: job.name }, '[Cron] Job disabled — skipping');
      continue;
    }

    if (!cron.validate(job.schedule)) {
      logger.error({ name: job.name, schedule: job.schedule }, '[Cron] Invalid schedule');
      continue;
    }

    const task = cron.schedule(job.schedule, async () => {
      const start = Date.now();
      logger.debug({ name: job.name }, '[Cron] Starting');

      const ran = await withLock(job.name, async () => {
        const result = await job.handler();
        const duration = Date.now() - start;

        const prev = await getState(job.name);
        await setState(job.name, {
          lastRun: new Date().toISOString(),
          lastResult: result,
          lastDuration: duration,
          runCount: (prev.runCount || 0) + 1,
        });

        logger.info({ name: job.name, duration, result }, '[Cron] Completed');
      }, job.lockTtl);

      if (!ran) {
        // Lock was held or job errored
        const prev = await getState(job.name);
        if (!ran) {
          await setState(job.name, {
            errorCount: (prev.errorCount || 0) + 1,
          });
        }
      }
    });

    scheduledTasks.set(job.name, task);
    logger.info({ name: job.name, schedule: job.schedule }, '[Cron] Registered');
  }

  logger.info({ count: scheduledTasks.size }, '[Cron] All jobs initialized');
}

/**
 * Get status of all registered jobs (for admin API).
 */
export async function getCronStatus(): Promise<CronJobState[]> {
  const statuses: CronJobState[] = [];

  for (const job of jobs) {
    const state = await getState(job.name);
    statuses.push({
      name: job.name,
      description: job.description,
      schedule: job.schedule,
      enabled: job.enabled,
      lastRun: state.lastRun || null,
      lastResult: state.lastResult || null,
      lastDuration: state.lastDuration || null,
      nextRun: null, // node-cron doesn't expose next run easily
      runCount: state.runCount || 0,
      errorCount: state.errorCount || 0,
    });
  }

  return statuses;
}

/**
 * Manually trigger a job by name (for admin API).
 */
export async function triggerJob(name: string): Promise<{ success: boolean; result?: any; error?: string }> {
  const job = jobs.find(j => j.name === name);
  if (!job) return { success: false, error: `Job '${name}' not found` };

  try {
    const start = Date.now();
    const result = await job.handler();
    const duration = Date.now() - start;

    const prev = await getState(name);
    await setState(name, {
      lastRun: new Date().toISOString(),
      lastResult: result,
      lastDuration: duration,
      runCount: (prev.runCount || 0) + 1,
    });

    return { success: true, result };
  } catch (err: any) {
    const prev = await getState(name);
    await setState(name, { errorCount: (prev.errorCount || 0) + 1 });
    return { success: false, error: err.message };
  }
}

/**
 * Get the list of registered job names.
 */
export function getJobNames(): string[] {
  return jobs.map(j => j.name);
}
