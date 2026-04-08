import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { healthService } from '../../../modules/health/health.service';

export const getHealth = (_req: Request, res: Response) => {
  return sendSuccess(res, healthService.getSnapshot(), 'Healthy');
};
