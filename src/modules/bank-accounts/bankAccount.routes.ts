import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as ctrl from './bankAccount.controller';
import { createBankAccountSchema, updateBankAccountSchema } from './bankAccount.schema';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Caller-scoped (instructor's own bank accounts) unless caller has bank_account:read
r.get('/me',                 ctrl.listMine);
r.post('/',                  validate(createBankAccountSchema), ctrl.create);
r.get('/:id',                ctrl.getById);
r.patch('/:id',              validate(updateBankAccountSchema), ctrl.update);
r.patch('/:id/primary',      ctrl.setPrimary);
r.post('/:id/verify',        ctrl.verifyAccount);
r.delete('/:id',             ctrl.softDelete);

// Admin-only (listing across users)
r.get('/',                   ctrl.listAll);

export default r;
