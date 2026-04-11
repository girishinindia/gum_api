import { Router } from 'express';

import v1Router from './v1';

// ═══════════════════════════════════════════════════════════════
// API aggregator.
// All versioned routers mount under /api here. v2 can slot in
// alongside v1 without touching app.ts.
// ═══════════════════════════════════════════════════════════════

const apiRouter = Router();

apiRouter.use('/v1', v1Router);

export default apiRouter;
