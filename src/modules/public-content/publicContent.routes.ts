import { Router } from 'express';
import * as ctrl from './publicContent.controller';

const r = Router();

// Public legal policies + FAQs (translation-aware)
r.get('/policies', ctrl.policiesIndex);
r.get('/policy/:code', ctrl.policyByCode);
r.get('/faqs', ctrl.faqsGrouped);
// Public announcements (published + active + not expired; pinned first)
r.get('/announcements', ctrl.announcementsPublic);

export default r;
