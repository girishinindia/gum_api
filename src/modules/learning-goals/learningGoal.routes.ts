import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createLearningGoalSchema, updateLearningGoalSchema } from './learningGoal.schema';
import * as ctrl from './learningGoal.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('learning_goal', 'create'),      validate(createLearningGoalSchema), ctrl.create);
r.patch('/:id/restore',   requirePermission('learning_goal', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('learning_goal', 'update'),      validate(updateLearningGoalSchema), ctrl.update);
r.delete('/:id/permanent', requirePermission('learning_goal', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('learning_goal', 'soft_delete'), ctrl.softDelete);

export default r;
