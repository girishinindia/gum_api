import { Router } from 'express';
import * as ctrl from './publicContent.controller';

const r = Router();

// Public legal policies + FAQs (translation-aware)
r.get('/policies', ctrl.policiesIndex);
r.get('/policy/:code', ctrl.policyByCode);
r.get('/faqs', ctrl.faqsGrouped);

export default r;
