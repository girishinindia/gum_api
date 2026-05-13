import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions } from '../../middleware/rbac';
import * as ctrl from './instructorPayout.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// FY-wise TDS statement (26AS-style) — instructor sees their own,
// admin can pass ?instructor_id=N to view any.
r.get('/me/tds-statement',                ctrl.myTdsStatement);
r.get('/:instructorId/tds-statement',     ctrl.tdsStatementByInstructor);

export default r;
