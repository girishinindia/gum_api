import { Router } from 'express';

import authRoutes from './auth/auth.routes';
import healthRoutes from './health/health.routes';
import rolePermissionsRoutes from './junctions/role-permissions.routes';
import userPermissionsRoutes from './junctions/user-permissions.routes';
import branchDepartmentsRoutes from './resources/branch-departments.routes';
import branchesRoutes from './resources/branches.routes';
import categoriesRoutes from './resources/categories.routes';
import citiesRoutes from './resources/cities.routes';
import countriesRoutes from './resources/countries.routes';
import departmentsRoutes from './resources/departments.routes';
import designationsRoutes from './resources/designations.routes';
import documentTypesRoutes from './resources/document-types.routes';
import documentsRoutes from './resources/documents.routes';
import educationLevelsRoutes from './resources/education-levels.routes';
import languagesRoutes from './resources/languages.routes';
import learningGoalsRoutes from './resources/learning-goals.routes';
import permissionsRoutes from './resources/permissions.routes';
import rolesRoutes from './resources/roles.routes';
import skillsRoutes from './resources/skills.routes';
import socialMediasRoutes from './resources/social-medias.routes';
import specializationsRoutes from './resources/specializations.routes';
import statesRoutes from './resources/states.routes';
import subCategoriesRoutes from './resources/sub-categories.routes';
import usersRoutes from './users/users.routes';

// Phase 04 — User profiles & sub-resources
import userProfilesRoutes from './user-profiles/user-profiles.routes';
import userEducationRoutes from './user-education/user-education.routes';
import userExperienceRoutes from './user-experience/user-experience.routes';
import userSocialMediasRoutes from './user-social-medias/user-social-medias.routes';
import userSkillsRoutes from './user-skills/user-skills.routes';
import userLanguagesRoutes from './user-languages/user-languages.routes';
import userDocumentsRoutes from './user-documents/user-documents.routes';
import userProjectsRoutes from './user-projects/user-projects.routes';

// Phase 05 — Employee management
import employeeProfilesRoutes from './employee-profiles/employee-profiles.routes';

// Phase 06 — Student management
import studentProfilesRoutes from './student-profiles/student-profiles.routes';

// Phase 07 — Instructor management
import instructorProfilesRoutes from './instructor-profiles/instructor-profiles.routes';

// Phase 08 — Material management
import subjectsRoutes from './subjects/subjects.routes';
import chaptersRoutes from './chapters/chapters.routes';
import topicsRoutes from './topics/topics.routes';
import subTopicsRoutes from './sub-topics/sub-topics.routes';

// Phase 09 — Course management
import coursesRoutes from './courses/courses.routes';
import courseSubCategoriesRoutes from './course-sub-categories/course-sub-categories.routes';
import courseModulesRoutes from './course-modules/course-modules.routes';
import courseSubjectsRoutes from './course-subjects/course-subjects.routes';
import courseChaptersRoutes from './course-chapters/course-chapters.routes';
import courseInstructorsRoutes from './course-instructors/course-instructors.routes';
import courseModuleTopicsRoutes from './course-module-topics/course-module-topics.routes';
import bundlesRoutes from './bundles/bundles.routes';
import bundleCoursesRoutes from './bundle-courses/bundle-courses.routes';

// ═══════════════════════════════════════════════════════════════
// v1 router aggregator — Phase 00 / 01 / 02 / 03 / 04 / 05 / 06 / 07 / 08 / 09.
// ═══════════════════════════════════════════════════════════════

const v1Router = Router();

// ── Health ────────────────────────────────────────────────────
v1Router.use('/health', healthRoutes);

// ── Phase 01 — Role-based user management ─────────────────────
v1Router.use('/auth', authRoutes);
v1Router.use('/countries', countriesRoutes);
v1Router.use('/roles', rolesRoutes);
v1Router.use('/permissions', permissionsRoutes);
v1Router.use('/role-permissions', rolePermissionsRoutes);
v1Router.use('/user-permissions', userPermissionsRoutes);
v1Router.use('/users', usersRoutes);

// ── Phase 02 — Master data management ─────────────────────────
v1Router.use('/states', statesRoutes);
v1Router.use('/cities', citiesRoutes);
v1Router.use('/skills', skillsRoutes);
v1Router.use('/languages', languagesRoutes);
v1Router.use('/education-levels', educationLevelsRoutes);
v1Router.use('/document-types', documentTypesRoutes);
v1Router.use('/documents', documentsRoutes);
v1Router.use('/designations', designationsRoutes);
v1Router.use('/specializations', specializationsRoutes);
v1Router.use('/learning-goals', learningGoalsRoutes);
v1Router.use('/social-medias', socialMediasRoutes);
v1Router.use('/categories', categoriesRoutes);
v1Router.use('/sub-categories', subCategoriesRoutes);

// ── Phase 03 — Branch management ─────────────────────────────
v1Router.use('/branches', branchesRoutes);
v1Router.use('/departments', departmentsRoutes);
v1Router.use('/branch-departments', branchDepartmentsRoutes);

// ── Phase 04 — User profiles & sub-resources ─────────────────
v1Router.use('/user-profiles', userProfilesRoutes);
v1Router.use('/user-education', userEducationRoutes);
v1Router.use('/user-experience', userExperienceRoutes);
v1Router.use('/user-social-medias', userSocialMediasRoutes);
v1Router.use('/user-skills', userSkillsRoutes);
v1Router.use('/user-languages', userLanguagesRoutes);
v1Router.use('/user-documents', userDocumentsRoutes);
v1Router.use('/user-projects', userProjectsRoutes);

// ── Phase 05 — Employee management ───────────────────────────
v1Router.use('/employee-profiles', employeeProfilesRoutes);

// ── Phase 06 — Student management ────────────────────────────
v1Router.use('/student-profiles', studentProfilesRoutes);

// ── Phase 07 — Instructor management ─────────────────────────
v1Router.use('/instructor-profiles', instructorProfilesRoutes);

// ── Phase 08 — Material management ───────────────────────────
v1Router.use('/subjects', subjectsRoutes);
v1Router.use('/chapters', chaptersRoutes);
v1Router.use('/topics', topicsRoutes);
v1Router.use('/sub-topics', subTopicsRoutes);

// ── Phase 09 — Course management ─────────────────────────────
v1Router.use('/courses', coursesRoutes);
v1Router.use('/course-sub-categories', courseSubCategoriesRoutes);
v1Router.use('/course-modules', courseModulesRoutes);
v1Router.use('/course-subjects', courseSubjectsRoutes);
v1Router.use('/course-chapters', courseChaptersRoutes);
v1Router.use('/course-instructors', courseInstructorsRoutes);
v1Router.use('/course-module-topics', courseModuleTopicsRoutes);
v1Router.use('/bundles', bundlesRoutes);
v1Router.use('/bundle-courses', bundleCoursesRoutes);

export default v1Router;
