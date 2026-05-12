import { Router } from 'express';
import {
  getProgressOverview,
  getStudentDetail,
  getQuizAnalytics,
  getVideoWatchHistory,
  getQuizAttempts,
  getProjectSubmissions,
  getStudentsList,
} from './studentProgress.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const router = Router();

router.use(authMiddleware, attachPermissions());

// Overview stats (cards + charts)
router.get('/overview',         requirePermission('student_progress', 'read'), getProgressOverview);

// Students list with progress summary
router.get('/students',         requirePermission('student_progress', 'read'), getStudentsList);

// Single student detail
router.get('/students/:userId', requirePermission('student_progress', 'read'), getStudentDetail);

// Quiz analytics (pass rates, question difficulty)
router.get('/quiz-analytics',   requirePermission('student_progress', 'read'), getQuizAnalytics);

// Video watch history
router.get('/video-history',    requirePermission('student_progress', 'read'), getVideoWatchHistory);

// Quiz attempts
router.get('/quiz-attempts',    requirePermission('student_progress', 'read'), getQuizAttempts);

// Project submissions
router.get('/submissions',      requirePermission('student_progress', 'read'), getProjectSubmissions);

export default router;
