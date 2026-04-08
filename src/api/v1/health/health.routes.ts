import { Router } from 'express';

import { getHealth, getDebugHealth } from './health.controller';

const healthRoutes = Router();

healthRoutes.get('/', getHealth);

// ⚠️  Debug endpoint — REMOVE after identifying the production issue
healthRoutes.get('/debug', getDebugHealth);

export { healthRoutes };
