/**
 * Admin Queue Controller (Phase 7.7)
 * ──────────────────────────────────
 * Operator endpoints for poking at BullMQ queues. Strictly admin-only
 * (requireSuperAdmin). Read endpoint surfaces counts; write endpoints
 * retry failed jobs from the DLQ.
 */

import { Request, Response } from 'express';
import { ok, err } from '../../utils/response';
import {
  getAllQueueStats,
  isQueueEnabled,
  retryAllFailed,
  retryJob,
  KNOWN_QUEUES,
  type QueueName,
} from '../../services/queue.service';

function isKnownQueue(name: string): name is QueueName {
  return (KNOWN_QUEUES as readonly string[]).includes(name);
}

/** GET /admin/queues — list queue stats */
export async function list(_req: Request, res: Response) {
  if (!isQueueEnabled()) {
    return ok(res, { enabled: false, queues: [] }, 'Queues are disabled (set QUEUE_ENABLED=true)');
  }
  const stats = await getAllQueueStats();
  return ok(res, { enabled: true, queues: stats });
}

/** POST /admin/queues/:name/retry-failed — bulk retry */
export async function retryAll(req: Request, res: Response) {
  const name = req.params.name;
  if (!isKnownQueue(name)) return err(res, `Unknown queue '${name}'`, 400);
  if (!isQueueEnabled()) return err(res, 'Queues are disabled', 409);

  const result = await retryAllFailed(name);
  return ok(res, result, `Retry triggered on queue ${name}`);
}

/** POST /admin/queues/:name/jobs/:jobId/retry — single retry */
export async function retryOne(req: Request, res: Response) {
  const name = req.params.name;
  const jobId = req.params.jobId;
  if (!isKnownQueue(name)) return err(res, `Unknown queue '${name}'`, 400);
  if (!isQueueEnabled()) return err(res, 'Queues are disabled', 409);

  const ok2 = await retryJob(name, jobId);
  if (!ok2) return err(res, 'Job not found', 404);
  return ok(res, { retried: jobId }, 'Job re-queued');
}
