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
import employeeProfilesRoutes from './employee-profiles/employee-profiles.routes';
import instructorProfilesRoutes from './instructor-profiles/instructor-profiles.routes';
import documentsRoutes from './resources/documents.routes';
import educationLevelsRoutes from './resources/education-levels.routes';
import languagesRoutes from './resources/languages.routes';
import learningGoalsRoutes from './resources/learning-goals.routes';
import permissionsRoutes from './resources/permissions.routes';
import rolesRoutes from './resources/roles.routes';
import skillsRoutes from './resources/skills.routes';
import socialMediasRoutes from './resources/social-medias.routes';
import specializationsRoutes from './resources/specializations.routes';
import studentProfilesRoutes from './student-profiles/student-profiles.routes';
import statesRoutes from './resources/states.routes';
import subCategoriesRoutes from './resources/sub-categories.routes';
import userDocumentsRoutes from './user-documents/user-documents.routes';
import userEducationRoutes from './user-education/user-education.routes';
import userExperienceRoutes from './user-experience/user-experience.routes';
import userLanguagesRoutes from './user-languages/user-languages.routes';
import userProfilesRoutes from './user-profiles/user-profiles.routes';
import userProjectsRoutes from './user-projects/user-projects.routes';
import userSkillsRoutes from './user-skills/user-skills.routes';
import userSocialMediasRoutes from './user-social-medias/user-social-medias.routes';
import subjectsRoutes from './subjects/subjects.routes';
import chaptersRoutes from './chapters/chapters.routes';
import topicsRoutes from './topics/topics.routes';
import subTopicsRoutes from './sub-topics/sub-topics.routes';
import usersRoutes from './users/users.routes';

// ═══════════════════════════════════════════════════════════════
// v1 router aggregator.
// Additional module routers will be mounted here as modules land.
// ═══════════════════════════════════════════════════════════════

const v1Router = Router();

v1Router.use('/health', healthRoutes);
v1Router.use('/auth', authRoutes);
v1Router.use('/countries', countriesRoutes);
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
v1Router.use('/roles', rolesRoutes);
v1Router.use('/permissions', permissionsRoutes);
v1Router.use('/role-permissions', rolePermissionsRoutes);
v1Router.use('/user-permissions', userPermissionsRoutes);
v1Router.use('/branches', branchesRoutes);
v1Router.use('/departments', departmentsRoutes);
v1Router.use('/branch-departments', branchDepartmentsRoutes);
v1Router.use('/users', usersRoutes);
v1Router.use('/employee-profiles', employeeProfilesRoutes);
v1Router.use('/student-profiles', studentProfilesRoutes);
v1Router.use('/instructor-profiles', instructorProfilesRoutes);
v1Router.use('/user-profiles', userProfilesRoutes);
v1Router.use('/user-education', userEducationRoutes);
v1Router.use('/user-experience', userExperienceRoutes);
v1Router.use('/user-social-medias', userSocialMediasRoutes);
v1Router.use('/user-skills', userSkillsRoutes);
v1Router.use('/user-languages', userLanguagesRoutes);
v1Router.use('/user-documents', userDocumentsRoutes);
v1Router.use('/user-projects', userProjectsRoutes);
v1Router.use('/subjects', subjectsRoutes);
v1Router.use('/chapters', chaptersRoutes);
v1Router.use('/topics', topicsRoutes);
v1Router.use('/sub-topics', subTopicsRoutes);

export default v1Router;
