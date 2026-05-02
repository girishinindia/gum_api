import { Router } from 'express';
import multer from 'multer';
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

// Sub-topic translations
r.post('/generate-sub-topic-translation', requirePermission('ai', 'create'), ctrl.generateSubTopicTranslation);
r.post('/bulk-generate-sub-topic-translations', requirePermission('ai', 'create'), ctrl.bulkGenerateSubTopicTranslations);

// User profile sample data generation
r.post('/generate-sample-data', requirePermission('ai', 'create'), ctrl.generateSampleData);

// Master data generation
r.post('/generate-master-data', requirePermission('ai', 'create'), ctrl.generateMasterData);
r.post('/update-master-data', requirePermission('ai', 'update'), ctrl.updateMasterData);

// Resume content (headline + bio)
r.post('/generate-resume-content', requirePermission('ai', 'create'), ctrl.generateResumeContent);

// Auto sub-topics from HTML file
const htmlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const ext = file.originalname.toLowerCase(); if (ext.endsWith('.html') || ext.endsWith('.htm')) cb(null, true); else cb(new Error('Only HTML files are allowed')); } });
r.post('/auto-sub-topics', requirePermission('ai', 'create'), htmlUpload.single('file'), ctrl.autoSubTopics);

// Translate HTML page to all languages
r.post('/translate-page', requirePermission('ai', 'create'), htmlUpload.single('file'), ctrl.translatePage);

// Reverse translate HTML page to English (from any language)
r.post('/reverse-translate-page', requirePermission('ai', 'create'), htmlUpload.single('file'), ctrl.reverseTranslatePage);

// Import material tree from TXT file
const txtUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const ext = file.originalname.toLowerCase(); if (ext.endsWith('.txt') || ext.endsWith('.csv')) cb(null, true); else cb(new Error('Only .txt or .csv files are allowed')); } });
r.post('/import-material-tree', requirePermission('ai', 'create'), txtUpload.single('file'), ctrl.importMaterialTree);

// Scan CDN — read-only preview of course folders for selective import
r.post('/scan-cdn', requirePermission('ai', 'read'), ctrl.scanCdn);

// Import from CDN — scan Bunny storage and create missing DB records
r.post('/import-from-cdn', requirePermission('ai', 'create'), ctrl.importFromCdn);

// Scaffold CDN folder structure from .txt course file
r.post('/scaffold-cdn', requirePermission('ai', 'create'), ctrl.scaffoldCdn);

// Check video transcoding status
r.post('/check-video-status', requirePermission('ai', 'create'), ctrl.checkVideoStatus);

// Clean orphaned videos from Bunny Stream (not linked to any DB record)
r.post('/clean-orphaned-videos', requirePermission('ai', 'delete'), ctrl.cleanOrphanedVideos);

// Generate YouTube video title + description from English CDN file
r.post('/generate-youtube-description', requirePermission('ai', 'create'), ctrl.generateYoutubeDescription);

// Bulk generate missing content for multiple entities (subjects/chapters/topics/sub-topics)
r.post('/bulk-generate-missing-content', requirePermission('ai', 'create'), ctrl.bulkGenerateMissingContent);

// Auto MCQ generation from topic tutorials
r.post('/auto-generate-mcq', requirePermission('mcq_question', 'create'), ctrl.autoGenerateMcq);

// Auto translate existing MCQ questions to missing languages
r.post('/auto-translate-mcq', requirePermission('mcq_question_translation', 'create'), ctrl.autoTranslateMcq);

// Auto One Word generation from topic tutorials
r.post('/auto-generate-ow', requirePermission('ow_question', 'create'), ctrl.autoGenerateOw);

// Auto translate existing One Word questions to missing languages
r.post('/auto-translate-ow', requirePermission('ow_question_translation', 'create'), ctrl.autoTranslateOw);

// Auto Descriptive generation from topic tutorials
r.post('/auto-generate-desc', requirePermission('desc_question', 'create'), ctrl.autoGenerateDesc);

// Auto translate existing Descriptive questions to missing languages
r.post('/auto-translate-desc', requirePermission('desc_question_translation', 'create'), ctrl.autoTranslateDesc);

// Auto Matching generation from topic tutorials
r.post('/auto-generate-matching', requirePermission('matching_question', 'create'), ctrl.autoGenerateMatching);

// Auto translate existing Matching questions to missing languages
r.post('/auto-translate-matching', requirePermission('matching_question_translation', 'create'), ctrl.autoTranslateMatching);

// Auto Ordering generation from topic tutorials
r.post('/auto-generate-ordering', requirePermission('ordering_question', 'create'), ctrl.autoGenerateOrdering);

// Auto translate existing Ordering questions to missing languages
r.post('/auto-translate-ordering', requirePermission('ordering_question_translation', 'create'), ctrl.autoTranslateOrdering);

export default r;
