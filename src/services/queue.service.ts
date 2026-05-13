/**
 * Queue Service (Phase 7.2)
 * ─────────────────────────
 * Thin wrapper around BullMQ.  Centralises:
 *   • the Redis connection (reuses the existing Upstash URL)
 *   • the prefix + retention policy
 *   • lazy queue construction so callers don't pay startup cost if disabled
 *   • a `enqueue(name, data, opts?)` helper that returns a JobId and is
 *     safe to call from any module — falls back to running the handler
 *     synchronously when `config.queue.enabled` is false.
 *   • worker factory used by `src/worker.ts` to spin up processors.
 *
 * IMPORTANT: in any code path that uses `enqueue(name, data, { syncFallback })`,
 * the `syncFallback` is invoked in-process when queues are disabled — so the
 * existing sync behaviour is preserved 1-for-1 when QUEUE_ENABLED=false.
 */

import { Queue, Worker, JobsOptions, Job, QueueEvents } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

export type QueueName =
  | 'email'
  | 'sms'
  | 'push'
  | 'notifications'
  | 'ai-generation'
  | 'video-import'
  | 'pdf-generation'
  | 'payouts';

// ── Redis connection (shared by all queues + workers) ─────────────
let _connection: Redis | null = null;
function getConnection(): Redis {
  if (_connection) return _connection;
  _connection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,    // BullMQ requirement
    enableReadyCheck: false,
  });
  _connection.on('error', (err) => logger.error({ err }, '[Queue] Redis error'));
  return _connection;
}

// ── Lazy queue cache ──────────────────────────────────────────────
const _queues = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  let q = _queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: getConnection(),
      prefix: config.queue.prefix,
      defaultJobOptions: {
        attempts: config.queue.defaultAttempts,
        backoff: { type: 'exponential', delay: config.queue.defaultBackoffMs },
        removeOnComplete: {
          age: config.queue.completedRetentionSeconds,
          count: 10_000,
        },
        removeOnFail: {
          age: config.queue.failedRetentionSeconds,
          count: 5_000,
        },
      },
    });
    _queues.set(name, q);
  }
  return q;
}

// ── Public API ────────────────────────────────────────────────────

export interface EnqueueOptions<T> {
  /**
   * If queues are disabled (QUEUE_ENABLED=false) this function runs
   * in-process to preserve the existing sync behaviour. Don't wrap it
   * yourself — the queue service decides.
   */
  syncFallback?: (data: T) => Promise<void>;

  /** BullMQ job options override (delay, priority, jobId for idempotency, etc.) */
  jobOptions?: JobsOptions;

  /** Stable job id for idempotent enqueues (e.g. `email:user_123:welcome`) */
  jobId?: string;
}

/**
 * Enqueue a job. When queues are disabled, runs `syncFallback` immediately.
 * Returns the BullMQ Job, or null when run synchronously.
 */
export async function enqueue<T = any>(
  queueName: QueueName,
  jobName: string,
  data: T,
  opts: EnqueueOptions<T> = {},
): Promise<Job<T> | null> {
  if (!config.queue.enabled) {
    if (opts.syncFallback) {
      // Preserve sync semantics when queues are off
      await opts.syncFallback(data);
    } else {
      logger.warn(
        { queueName, jobName },
        '[Queue] Queues disabled and no syncFallback provided — job dropped',
      );
    }
    return null;
  }

  const queue = getQueue(queueName);
  const job = await queue.add(jobName, data as any, {
    ...(opts.jobOptions ?? {}),
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
  });

  logger.debug(
    { queueName, jobName, jobId: job.id },
    '[Queue] enqueued',
  );
  return job;
}

/**
 * Build a Worker for a given queue. Caller provides the processor.
 * Used by `src/worker.ts`.
 */
export function buildWorker<T = any>(
  queueName: QueueName,
  processor: (job: Job<T>) => Promise<any>,
  concurrency?: number,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: getConnection(),
    prefix: config.queue.prefix,
    concurrency: concurrency ?? config.queue.workerConcurrency,
  });

  worker.on('completed', (job) => {
    logger.debug({ queueName, jobId: job.id, attempts: job.attemptsMade }, '[Worker] completed');
  });
  worker.on('failed', (job, err) => {
    logger.error(
      { queueName, jobId: job?.id, attempts: job?.attemptsMade, err: err.message },
      '[Worker] failed',
    );
  });
  worker.on('error', (err) => {
    logger.error({ queueName, err: err.message }, '[Worker] error');
  });

  return worker;
}

// ── Stats / admin helpers ────────────────────────────────────────

export interface QueueStats {
  name: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

const KNOWN_QUEUES: QueueName[] = [
  'email',
  'sms',
  'push',
  'notifications',
  'ai-generation',
  'video-import',
  'pdf-generation',
  'payouts',
];

export async function getAllQueueStats(): Promise<QueueStats[]> {
  if (!config.queue.enabled) return [];
  const stats: QueueStats[] = [];
  for (const name of KNOWN_QUEUES) {
    try {
      const q = getQueue(name);
      const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
      stats.push({
        name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        paused: counts.paused || 0,
      });
    } catch (err: any) {
      logger.warn({ name, err: err.message }, '[Queue] stats query failed');
    }
  }
  return stats;
}

export async function retryAllFailed(queueName: QueueName): Promise<{ retried: number }> {
  if (!config.queue.enabled) return { retried: 0 };
  const q = getQueue(queueName);
  // BullMQ exposes `retryJobs` which returns failed jobs to the waiting state
  await q.retryJobs({ state: 'failed' });
  const counts = await q.getJobCounts('waiting');
  return { retried: counts.waiting || 0 };
}

export async function retryJob(queueName: QueueName, jobId: string): Promise<boolean> {
  if (!config.queue.enabled) return false;
  const q = getQueue(queueName);
  const job = await q.getJob(jobId);
  if (!job) return false;
  await job.retry();
  return true;
}

export function isQueueEnabled(): boolean {
  return config.queue.enabled;
}

/** Graceful shutdown — called from server.ts SIGTERM handler. */
export async function shutdownQueues(): Promise<void> {
  for (const q of _queues.values()) {
    try { await q.close(); } catch { /* swallow */ }
  }
  _queues.clear();
  if (_connection) {
    try { await _connection.quit(); } catch { /* swallow */ }
    _connection = null;
  }
}

export { KNOWN_QUEUES };
export type { QueueEvents };
