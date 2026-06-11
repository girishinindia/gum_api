import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { supabase } from '../../config/supabase';
import * as ctrl from './authoring.controller';

// Phase 49 — Instructor course authoring (draft layer).
// June 2026 (Instructor Studio): the routes are now open to the instructor
// role (authoring_course permissions seeded), so every id-addressed operation
// verifies the draft belongs to the caller. Super admins bypass the guard;
// verify/reject remain approve-gated (not granted to instructors).
const r = Router();

// Phase 50 — media uploads: memory storage (req.file.buffer → Bunny). Videos
// up to 500 MB (matches sub-topics/courses), images & PDFs up to 50 MB.
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const txtUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) cb(null, true); else cb(new Error('Only .txt files are allowed')); } });

r.use(authMiddleware, attachPermissions());

// ── Own-draft guards (June 2026) ────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
type Resolver = (req: any) => Promise<number | null>;

function ownGuard(resolve: Resolver) {
  return async (req: any, res: any, next: any) => {
    try {
      if (req.userPerms?.isSuperAdmin) return next();
      const courseId = await resolve(req);
      if (!courseId) return res.status(404).json({ success: false, error: 'Not found' });
      const { data } = await supabase
        .from('authoring_courses')
        .select('instructor_id')
        .eq('id', courseId)
        .maybeSingle();
      if (!data) return res.status(404).json({ success: false, error: 'Not found' });
      if (Number(data.instructor_id) !== Number(req.user!.id)) {
        return res.status(403).json({ success: false, error: 'You can only manage your own course drafts' });
      }
      return next();
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e?.message || 'Ownership check failed' });
    }
  };
}

const childResolver = (table: string): Resolver => async (req) => {
  const id = parseInt(req.params.id);
  if (!id) return null;
  const { data } = await supabase.from(table).select('authoring_course_id').eq('id', id).maybeSingle();
  return (data as any)?.authoring_course_id ?? null;
};

const ownCourse    = ownGuard(async (req) => parseInt(req.params.id) || null);
const ownByBody    = ownGuard(async (req) => parseInt(req.body?.authoring_course_id) || null);
const ownByQuery   = ownGuard(async (req) => parseInt(req.query?.authoring_course_id as string) || null);
const ownUnit      = ownGuard(childResolver('authoring_units'));
const ownHighlight = ownGuard(childResolver('authoring_course_highlights'));
const ownFaq       = ownGuard(childResolver('authoring_faqs'));
const ownCapstone  = ownGuard(childResolver('authoring_capstone_projects'));
const ownMini      = ownGuard(childResolver('authoring_mini_projects'));
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Draft courses ──
// (list self-scopes inside the controller for non-super-admins)
r.get('/courses',              requirePermission('authoring_course', 'read'),    ctrl.listCourses);
r.get('/courses/:id',          requirePermission('authoring_course', 'read'),    ownCourse, ctrl.getCourse);
r.post('/courses',             requirePermission('authoring_course', 'create'),  ctrl.createCourse);
r.get('/courses/:id/readiness', requirePermission('authoring_course', 'read'),   ownCourse, ctrl.getReadiness);
r.patch('/courses/:id/submit', requirePermission('authoring_course', 'update'),  ownCourse, ctrl.submitCourse);
r.patch('/courses/:id/verify', requirePermission('authoring_course', 'approve'), ctrl.verifyCourse);
// Phase 50 — media uploads (Bunny)
r.post('/courses/:id/thumbnail',     requirePermission('authoring_course', 'update'), ownCourse, fileUpload.single('file'),  ctrl.uploadCourseThumbnail);
r.post('/courses/:id/trailer-video', requirePermission('authoring_course', 'update'), ownCourse, videoUpload.single('video'), ctrl.uploadCourseTrailerVideo);
r.delete('/courses/:id/trailer-video', requirePermission('authoring_course', 'update'), ownCourse, ctrl.removeCourseTrailerVideo);
r.get('/courses/:id/trailer-playback', requirePermission('authoring_course', 'read'), ownCourse, ctrl.courseTrailerPlayback);
// ── Import course structure from .txt file ──
r.post('/courses/:id/import-structure', requirePermission('authoring_course', 'update'), ownCourse, txtUpload.single('file'), ctrl.importStructure);
r.patch('/courses/:id/reject', requirePermission('authoring_course', 'approve'), ctrl.rejectCourse);
r.patch('/courses/:id/restore',requirePermission('authoring_course', 'update'),  ownCourse, ctrl.restoreCourse);
r.patch('/courses/:id',        requirePermission('authoring_course', 'update'),  ownCourse, ctrl.updateCourse);
r.delete('/courses/:id/permanent', requirePermission('authoring_course', 'delete'), ownCourse, ctrl.removeCourse);
r.delete('/courses/:id',       requirePermission('authoring_course', 'delete'),  ownCourse, ctrl.softDeleteCourse);

// ── Course highlights (prerequisites / outcomes / skills / audience / requirements) ──
r.get('/highlights',           requirePermission('authoring_course', 'read'),    ownByQuery, ctrl.listHighlights);
r.post('/highlights',          requirePermission('authoring_course', 'update'),  ownByBody, ctrl.createHighlight);
r.patch('/highlights/:id',     requirePermission('authoring_course', 'update'),  ownHighlight, ctrl.updateHighlight);
r.delete('/highlights/:id',    requirePermission('authoring_course', 'update'),  ownHighlight, ctrl.removeHighlight);

// ── Curriculum units (module / chapter / topic tree) ──
r.get('/units',                requirePermission('authoring_course', 'read'),    ownByQuery, ctrl.listUnits);
r.post('/units',               requirePermission('authoring_course', 'update'),  ownByBody, ctrl.createUnit);
r.patch('/units/:id',          requirePermission('authoring_course', 'update'),  ownUnit, ctrl.updateUnit);
// Phase 50 — topic media uploads (Bunny)
r.post('/units/:id/video',     requirePermission('authoring_course', 'update'), ownUnit, videoUpload.single('video'), ctrl.uploadUnitVideo);
r.delete('/units/:id/video',   requirePermission('authoring_course', 'update'), ownUnit, ctrl.removeUnitVideo);
r.get('/units/:id/video-playback', requirePermission('authoring_course', 'read'), ownUnit, ctrl.unitVideoPlayback);
r.post('/units/:id/file',      requirePermission('authoring_course', 'update'), ownUnit, fileUpload.single('file'),  ctrl.uploadUnitFile);
r.delete('/units/:id/file',    requirePermission('authoring_course', 'update'), ownUnit, ctrl.removeUnitFile);
r.delete('/units/:id/permanent', requirePermission('authoring_course', 'delete'), ownUnit, ctrl.removeUnit);
r.delete('/units/:id',         requirePermission('authoring_course', 'update'),  ownUnit, ctrl.softDeleteUnit);

// ── FAQs ──
r.get('/faqs',                 requirePermission('authoring_course', 'read'),    ownByQuery, ctrl.listFaqs);
r.post('/faqs',                requirePermission('authoring_course', 'update'),  ownByBody, ctrl.createFaq);
r.patch('/faqs/:id',           requirePermission('authoring_course', 'update'),  ownFaq, ctrl.updateFaq);
r.delete('/faqs/:id',          requirePermission('authoring_course', 'update'),  ownFaq, ctrl.removeFaq);

// ── Capstone projects (course-level: PDF brief + solution ZIP/GitHub) ──
r.get('/capstone-projects',            requirePermission('authoring_course', 'read'),   ownByQuery, ctrl.listCapstoneProjects);
r.get('/capstone-projects/:id',        requirePermission('authoring_course', 'read'),   ownCapstone, ctrl.getCapstoneProject);
r.post('/capstone-projects',           requirePermission('authoring_course', 'update'), ownByBody, ctrl.createCapstoneProject);
r.patch('/capstone-projects/:id',      requirePermission('authoring_course', 'update'), ownCapstone, ctrl.updateCapstoneProject);
r.post('/capstone-projects/:id/file',  requirePermission('authoring_course', 'update'), ownCapstone, fileUpload.single('file'), ctrl.uploadCapstoneFile);
r.delete('/capstone-projects/:id/file',requirePermission('authoring_course', 'update'), ownCapstone, ctrl.removeCapstoneFile);
r.delete('/capstone-projects/:id/permanent', requirePermission('authoring_course', 'delete'), ownCapstone, ctrl.removeCapstoneProject);
r.delete('/capstone-projects/:id',     requirePermission('authoring_course', 'update'), ownCapstone, ctrl.softDeleteCapstoneProject);

// ── Mini projects (module/chapter-level: PDF brief + solution ZIP/GitHub) ──
r.get('/mini-projects',            requirePermission('authoring_course', 'read'),   ownByQuery, ctrl.listMiniProjects);
r.get('/mini-projects/:id',        requirePermission('authoring_course', 'read'),   ownMini, ctrl.getMiniProject);
r.post('/mini-projects',           requirePermission('authoring_course', 'update'), ownByBody, ctrl.createMiniProject);
r.patch('/mini-projects/:id',      requirePermission('authoring_course', 'update'), ownMini, ctrl.updateMiniProject);
r.post('/mini-projects/:id/file',  requirePermission('authoring_course', 'update'), ownMini, fileUpload.single('file'), ctrl.uploadMiniProjectFile);
r.delete('/mini-projects/:id/file',requirePermission('authoring_course', 'update'), ownMini, ctrl.removeMiniProjectFile);
r.delete('/mini-projects/:id/permanent', requirePermission('authoring_course', 'delete'), ownMini, ctrl.removeMiniProject);
r.delete('/mini-projects/:id',     requirePermission('authoring_course', 'update'), ownMini, ctrl.softDeleteMiniProject);

export default r;
