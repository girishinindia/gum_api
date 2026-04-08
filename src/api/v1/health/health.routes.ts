import { Router } from 'express';

import { getHealth } from './health.controller';

const healthRoutes = Router();

healthRoutes.get('/', getHealth);

export { healthRoutes };
