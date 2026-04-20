import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './ai.controller';

const r = Router();

r.use(authMiddleware, attachPermissions());

// Category translations
r.post('/generate-translation', requirePermission('category_translation', 'create'), ctrl.generateTranslation);
r.post('/bulk-generate-translations', requirePermission('category_translation', 'create'), ctrl.bulkGenerateTranslations);

// Sub-category translations
r.post('/generate-sub-category-translation', requirePermission('sub_category_translation', 'create'), ctrl.generateSubCategoryTranslation);
r.post('/bulk-generate-sub-category-translations', requirePermission('sub_category_translation', 'create'), ctrl.bulkGenerateSubCategoryTranslations);

// Subject translations
r.post('/generate-subject-translation', requirePermission('ai', 'create'), ctrl.generateSubjectTranslation);
r.post('/bulk-generate-subject-translations', requirePermission('ai', 'create'), ctrl.bulkGenerateSubjectTranslations);

// Chapter translations
r.post('/generate-chapter-translation', requirePermission('ai', 'create'), ctrl.generateChapterTranslation);
r.post('/bulk-generate-chapter-translations', requirePermission('ai', 'create'), ctrl.bulkGenerateChapterTranslations);

// Topic translations
r.post('/generate-topic-translation', requirePermission('ai', 'create'), ctrl.generateTopicTranslation);
r.post('/bulk-generate-topic-translations', requirePermission('ai', 'create'), ctrl.bulkGenerateTopicTranslations);

// User profile sample data generation
r.post('/generate-sample-data', requirePermission('ai', 'create'), ctrl.generateSampleData);

// Master data generation
r.post('/generate-master-data', requirePermission('ai', 'create'), ctrl.generateMasterData);
r.post('/update-master-data', requirePermission('ai', 'update'), ctrl.updateMasterData);

// Resume content (headline + bio)
r.post('/generate-resume-content', requirePermission('ai', 'create'), ctrl.generateResumeContent);

export default r;
