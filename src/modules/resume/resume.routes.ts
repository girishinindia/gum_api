import { Router } from 'express';
import * as ctrl from './resume.controller';

const r = Router();

// Public — no auth middleware
r.get('/:slug', ctrl.getBySlug);

export default r;
