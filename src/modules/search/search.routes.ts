import { Router } from 'express';
import { publicSearchLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './search.controller';

/**
 * Public fuzzy-search routes (Phase 11.5).
 * Intentionally unauthenticated — anyone browsing the site can search the
 * published catalogue. Rate-limited per IP to prevent scraping.
 */
const r = Router();

r.get('/courses',     publicSearchLimiter, ctrl.searchCourses);
r.get('/instructors', publicSearchLimiter, ctrl.searchInstructors);

export default r;
