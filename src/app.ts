import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { activityLogger } from './middleware/activityLogger';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import roleRoutes from './modules/roles/role.routes';
import permissionRoutes from './modules/permissions/permission.routes';
import countryRoutes from './modules/countries/country.routes';
import stateRoutes from './modules/states/state.routes';
import cityRoutes from './modules/cities/city.routes';
import skillRoutes from './modules/skills/skill.routes';
import languageRoutes from './modules/languages/language.routes';
import educationLevelRoutes from './modules/education-levels/educationLevel.routes';
import documentTypeRoutes from './modules/document-types/documentType.routes';
import documentRoutes from './modules/documents/document.routes';
import designationRoutes from './modules/designations/designation.routes';
import specializationRoutes from './modules/specializations/specialization.routes';
import learningGoalRoutes from './modules/learning-goals/learningGoal.routes';
import socialMediaRoutes from './modules/social-medias/socialMedia.routes';
import categoryRoutes from './modules/categories/category.routes';
import subCategoryRoutes from './modules/sub-categories/subCategory.routes';
import categoryTranslationRoutes from './modules/category-translations/categoryTranslation.routes';
import subCategoryTranslationRoutes from './modules/sub-category-translations/subCategoryTranslation.routes';
import branchRoutes from './modules/branches/branch.routes';
import departmentRoutes from './modules/departments/department.routes';
import branchDepartmentRoutes from './modules/branch-departments/branchDepartment.routes';
import activityLogRoutes from './modules/activity-logs/activityLog.routes';
import tableSummaryRoutes from './modules/table-summary/tableSummary.routes';
import profileRoutes from './modules/profile/profile.routes';
import userProfileRoutes from './modules/user-profiles/userProfile.routes';
import userEducationRoutes from './modules/user-education/userEducation.routes';
import userExperienceRoutes from './modules/user-experience/userExperience.routes';
import userSocialMediaRoutes from './modules/user-social-medias/userSocialMedia.routes';
import userSkillRoutes from './modules/user-skills/userSkill.routes';
import userLanguageRoutes from './modules/user-languages/userLanguage.routes';
import userDocumentRoutes from './modules/user-documents/userDocument.routes';
import userProjectRoutes from './modules/user-projects/userProject.routes';
import employeeProfileRoutes from './modules/employee-profiles/employeeProfile.routes';
import studentProfileRoutes from './modules/student-profiles/studentProfile.routes';
import instructorProfileRoutes from './modules/instructor-profiles/instructorProfile.routes';
import subjectRoutes from './modules/subjects/subject.routes';
import chapterRoutes from './modules/chapters/chapter.routes';
import topicRoutes from './modules/topics/topic.routes';
import subjectTranslationRoutes from './modules/subject-translations/subjectTranslation.routes';
import chapterTranslationRoutes from './modules/chapter-translations/chapterTranslation.routes';
import topicTranslationRoutes from './modules/topic-translations/topicTranslation.routes';
import aiRoutes from './modules/ai/ai.routes';
import resumeRoutes from './modules/resume/resume.routes';

const app = express();

// ── Security ──
app.use(helmet());
app.use(hpp());
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS ──
app.use(cors({
  origin: config.cors.origins.includes('*') ? '*' : config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-recaptcha-token'],
}));

// ── Rate Limiting ──
app.use(rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, standardHeaders: true, legacyHeaders: false }));

// ── Activity Logger ──
app.use(activityLogger);

// ── Health Check ──
app.get('/health', (_req, res) => res.json({ status: 'ok', app: config.appName, version: config.apiVersion, timestamp: new Date().toISOString() }));

// ── API Routes ──
const api = `/api/${config.apiVersion}`;
app.use(`${api}/auth`,         authRoutes);
app.use(`${api}/users`,        userRoutes);
app.use(`${api}/profile`,      profileRoutes);
app.use(`${api}/roles`,        roleRoutes);
app.use(`${api}/permissions`,  permissionRoutes);
app.use(`${api}/countries`,    countryRoutes);
app.use(`${api}/states`,       stateRoutes);
app.use(`${api}/cities`,       cityRoutes);
app.use(`${api}/skills`,       skillRoutes);
app.use(`${api}/languages`,         languageRoutes);
app.use(`${api}/education-levels`,  educationLevelRoutes);
app.use(`${api}/document-types`,    documentTypeRoutes);
app.use(`${api}/documents`,         documentRoutes);
app.use(`${api}/designations`,      designationRoutes);
app.use(`${api}/specializations`,   specializationRoutes);
app.use(`${api}/learning-goals`,    learningGoalRoutes);
app.use(`${api}/social-medias`,     socialMediaRoutes);
app.use(`${api}/categories`,        categoryRoutes);
app.use(`${api}/sub-categories`,              subCategoryRoutes);
app.use(`${api}/category-translations`,       categoryTranslationRoutes);
app.use(`${api}/sub-category-translations`,   subCategoryTranslationRoutes);
app.use(`${api}/branches`,                    branchRoutes);
app.use(`${api}/departments`,                 departmentRoutes);
app.use(`${api}/branch-departments`,          branchDepartmentRoutes);
app.use(`${api}/activity-logs`,               activityLogRoutes);
app.use(`${api}/table-summary`,              tableSummaryRoutes);
app.use(`${api}/user-profiles`,              userProfileRoutes);
app.use(`${api}/user-education`,             userEducationRoutes);
app.use(`${api}/user-experience`,           userExperienceRoutes);
app.use(`${api}/user-social-medias`,        userSocialMediaRoutes);
app.use(`${api}/user-skills`,              userSkillRoutes);
app.use(`${api}/user-languages`,           userLanguageRoutes);
app.use(`${api}/user-documents`,           userDocumentRoutes);
app.use(`${api}/user-projects`,            userProjectRoutes);
app.use(`${api}/employee-profiles`,          employeeProfileRoutes);
app.use(`${api}/student-profiles`,           studentProfileRoutes);
app.use(`${api}/instructor-profiles`,        instructorProfileRoutes);
app.use(`${api}/subjects`,                    subjectRoutes);
app.use(`${api}/chapters`,                    chapterRoutes);
app.use(`${api}/topics`,                      topicRoutes);
app.use(`${api}/subject-translations`,        subjectTranslationRoutes);
app.use(`${api}/chapter-translations`,        chapterTranslationRoutes);
app.use(`${api}/topic-translations`,          topicTranslationRoutes);
app.use(`${api}/ai`,                        aiRoutes);
app.use(`${api}/resume`,                    resumeRoutes);

// ── 404 ──
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ── Global Error Handler ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  const message = config.env === 'production' ? 'Internal server error' : err.message;
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({ success: false, error: message });
});

export default app;
