import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './authoring.controller';

// Phase 49 — Instructor course authoring (draft layer). All routes are admin-
// protected; Super Admin passes every check via the RBAC wildcard. To open this
// to the instructor role later, seed authoring_course permission rows.
const r = Router();

// Phase 50 — media uploads: memory storage (req.file.buffer → Bunny). Videos
// up to 500 MB (matches sub-topics/courses), images & PDFs up to 50 MB.
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

r.use(authMiddleware, attachPermissions());

// ── Draft courses ──
r.get('/courses',              requirePermission('authoring_course', 'read'),    ctrl.listCourses);
r.get('/courses/:id',          requirePermission('authoring_course', 'read'),    ctrl.getCourse);
r.post('/courses',             requirePermission('authoring_course', 'create'),  ctrl.createCourse);
r.get('/courses/:id/readiness', requirePermission('authoring_course', 'read'),  ctrl.getReadiness);
r.patch('/courses/:id/submit', requirePermission('authoring_course', 'update'),  ctrl.submitCourse);
r.patch('/courses/:id/verify', requirePermission('authoring_course', 'approve'), ctrl.verifyCourse);
// Phase 50 — media uploads (Bunny)
r.post('/courses/:id/thumbnail',     requirePermission('authoring_course', 'update'), fileUpload.single('file'),  ctrl.uploadCourseThumbnail);
r.post('/courses/:id/trailer-video', requirePermission('authoring_course', 'update'), videoUpload.single('video'), ctrl.uploadCourseTrailerVideo);
r.delete('/courses/:id/trailer-video', requirePermission('authoring_course', 'update'), ctrl.removeCourseTrailerVideo);
r.get('/courses/:id/trailer-playback', requirePermission('authoring_course', 'read'), ctrl.courseTrailerPlayback);
r.patch('/courses/:id/reject', requirePermission('authoring_course', 'approve'), ctrl.rejectCourse);
r.patch('/courses/:id/restore',requirePermission('authoring_course', 'update'),  ctrl.restoreCourse);
r.patch('/courses/:id',        requirePermission('authoring_course', 'update'),  ctrl.updateCourse);
r.delete('/courses/:id/permanent', requirePermission('authoring_course', 'delete'), ctrl.removeCourse);
r.delete('/courses/:id',       requirePermission('authoring_course', 'delete'),  ctrl.softDeleteCourse);

// ── Course highlights (prerequisites / outcomes / skills / audience / requirements) ──
r.get('/highlights',           requirePermission('authoring_course', 'read'),    ctrl.listHighlights);
r.post('/highlights',          requirePermission('authoring_course', 'update'),  ctrl.createHighlight);
r.patch('/highlights/:id',     requirePermission('authoring_course', 'update'),  ctrl.updateHighlight);
r.delete('/highlights/:id',    requirePermission('authoring_course', 'update'),  ctrl.removeHighlight);

// ── Curriculum units (module / chapter / topic tree) ──
r.get('/units',                requirePermission('authoring_course', 'read'),    ctrl.listUnits);
r.post('/units',               requirePermission('authoring_course', 'update'),  ctrl.createUnit);
r.patch('/units/:id',          requirePermission('authoring_course', 'update'),  ctrl.updateUnit);
// Phase 50 — topic media uploads (Bunny)
r.post('/units/:id/video',     requirePermission('authoring_course', 'update'), videoUpload.single('video'), ctrl.uploadUnitVideo);
r.delete('/units/:id/video',   requirePermission('authoring_course', 'update'), ctrl.removeUnitVideo);
r.get('/units/:id/video-playback', requirePermission('authoring_course', 'read'), ctrl.unitVideoPlayback);
r.post('/units/:id/file',      requirePermission('authoring_course', 'update'), fileUpload.single('file'),  ctrl.uploadUnitFile);
r.delete('/units/:id/file',    requirePermission('authoring_course', 'update'), ctrl.removeUnitFile);
r.delete('/units/:id/permanent', requirePermission('authoring_course', 'delete'), ctrl.removeUnit);
r.delete('/units/:id',         requirePermission('authoring_course', 'update'),  ctrl.softDeleteUnit);

// ── FAQs ──
r.get('/faqs',                 requirePermission('authoring_course', 'read'),    ctrl.listFaqs);
r.post('/faqs',                requirePermission('authoring_course', 'update'),  ctrl.createFaq);
r.patch('/faqs/:id',           requirePermission('authoring_course', 'update'),  ctrl.updateFaq);
r.delete('/faqs/:id',          requirePermission('authoring_course', 'update'),  ctrl.removeFaq);

// ── Capstone projects (course-level: PDF brief + solution ZIP/GitHub) ──
r.get('/capstone-projects',            requirePermission('authoring_course', 'read'),   ctrl.listCapstoneProjects);
r.get('/capstone-projects/:id',        requirePermission('authoring_course', 'read'),   ctrl.getCapstoneProject);
r.post('/capstone-projects',           requirePermission('authoring_course', 'update'), ctrl.createCapstoneProject);
r.patch('/capstone-projects/:id',      requirePermission('authoring_course', 'update'), ctrl.updateCapstoneProject);
r.post('/capstone-projects/:id/file',  requirePermission('authoring_course', 'update'), fileUpload.single('file'), ctrl.uploadCapstoneFile);
r.delete('/capstone-projects/:id/file',requirePermission('authoring_course', 'update'), ctrl.removeCapstoneFile);
r.delete('/capstone-projects/:id/permanent', requirePermission('authoring_course', 'delete'), ctrl.removeCapstoneProject);
r.delete('/capstone-projects/:id',     requirePermission('authoring_course', 'update'), ctrl.softDeleteCapstoneProject);

// ── Mini projects (module/chapter-level: PDF brief + solution ZIP/GitHub) ──
r.get('/mini-projects',            requirePermission('authoring_course', 'read'),   ctrl.listMiniProjects);
r.get('/mini-projects/:id',        requirePermission('authoring_course', 'read'),   ctrl.getMiniProject);
r.post('/mini-projects',           requirePermission('authoring_course', 'update'), ctrl.createMiniProject);
r.patch('/mini-projects/:id',      requirePermission('authoring_course', 'update'), ctrl.updateMiniProject);
r.post('/mini-projects/:id/file',  requirePermission('authoring_course', 'update'), fileUpload.single('file'), ctrl.uploadMiniProjectFile);
r.delete('/mini-projects/:id/file',requirePermission('authoring_course', 'update'), ctrl.removeMiniProjectFile);
r.delete('/mini-projects/:id/permanent', requirePermission('authoring_course', 'delete'), ctrl.removeMiniProject);
r.delete('/mini-projects/:id',     requirePermission('authoring_course', 'update'), ctrl.softDeleteMiniProject);

export default r;
