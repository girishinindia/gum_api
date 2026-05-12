import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { attachPermissions, requirePermission } from '../middleware/rbac';
import { getCronStatus, triggerJob, getJobNames } from './index';
import { ok, err } from '../utils/response';
import { logAdmin } from '../services/activityLog.service';
import { getClientIp } from '../utils/helpers';

const r = Router();

// All cron admin routes require auth + admin permission
r.use(authMiddleware, attachPermissions());

/**
 * GET /cron/status — list all jobs with last run, next run, result
 */
r.get('/status', requirePermission('activity_log', 'read'), async (_req: Request, res: Response) => {
  try {
    const statuses = await getCronStatus();
    return ok(res, statuses);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
});

/**
 * GET /cron/jobs — list job names only
 */
r.get('/jobs', requirePermission('activity_log', 'read'), async (_req: Request, res: Response) => {
  return ok(res, getJobNames());
});

/**
 * POST /cron/:name/trigger — manually run a job
 */
r.post('/:name/trigger', requirePermission('activity_log', 'read'), async (req: Request, res: Response) => {
  const name = req.params.name as string;
  const result = await triggerJob(name);

  if (result.success) {
    logAdmin({
      actorId: req.user!.id,
      action: 'cron_job_triggered',
      targetType: 'cron_job',
      targetName: name,
      changes: result.result,
      ip: getClientIp(req),
    });
  }

  return ok(res, result, result.success ? `Job '${name}' triggered` : result.error);
});

export default r;
