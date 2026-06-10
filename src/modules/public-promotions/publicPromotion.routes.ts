import { Router } from 'express';
import * as ctrl from './publicPromotion.controller';

const r = Router();

// Public — best active instructor promotion for a course (promo pricing display)
r.get('/course/:courseId', ctrl.activeForCourse);

export default r;
