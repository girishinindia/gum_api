import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { RedisRateLimitStore } from './middleware/redisRateLimitStore';
import { config } from './config';
import { logger } from './utils/logger';
import { activityLogger } from './middleware/activityLogger';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

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
import instructorProfileRoutes from './modules/instructor-profiles/instructorProfile.routes';
import subjectRoutes from './modules/subjects/subject.routes';
import chapterRoutes from './modules/chapters/chapter.routes';
import topicRoutes from './modules/topics/topic.routes';
import subjectTranslationRoutes from './modules/subject-translations/subjectTranslation.routes';
import chapterTranslationRoutes from './modules/chapter-translations/chapterTranslation.routes';
import topicTranslationRoutes from './modules/topic-translations/topicTranslation.routes';
import subTopicRoutes from './modules/sub-topics/subTopic.routes';
import subTopicTranslationRoutes from './modules/sub-topic-translations/subTopicTranslation.routes';
import aiRoutes from './modules/ai/ai.routes';
import resumeRoutes from './modules/resume/resume.routes';
import materialTreeRoutes from './modules/material-tree/materialTree.routes';
import youtubeDescriptionRoutes from './modules/youtube-descriptions/youtubeDescription.routes';
import courseRoutes from './modules/courses/course.routes';
import courseTranslationRoutes from './modules/course-translations/courseTranslation.routes';
import courseSubCategoryRoutes from './modules/course-sub-categories/courseSubCategory.routes';
import courseModuleRoutes from './modules/course-modules/courseModule.routes';
import courseModuleTranslationRoutes from './modules/course-module-translations/courseModuleTranslation.routes';
import courseModuleSubjectRoutes from './modules/course-module-subjects/courseModuleSubject.routes';
import courseChapterRoutes from './modules/course-chapters/courseChapter.routes';
import courseChapterTopicRoutes from './modules/course-chapter-topics/courseChapterTopic.routes';
import bundleRoutes from './modules/bundles/bundle.routes';
import bundleTranslationRoutes from './modules/bundle-translations/bundleTranslation.routes';
import bundleCourseRoutes from './modules/bundle-courses/bundleCourse.routes';
import courseBatchRoutes from './modules/course-batches/courseBatch.routes';
import batchTranslationRoutes from './modules/batch-translations/batchTranslation.routes';
import mcqQuestionRoutes from './modules/mcq-questions/mcqQuestion.routes';
import mcqQuestionTranslationRoutes from './modules/mcq-question-translations/mcqQuestionTranslation.routes';
import mcqOptionRoutes from './modules/mcq-options/mcqOption.routes';
import mcqOptionTranslationRoutes from './modules/mcq-option-translations/mcqOptionTranslation.routes';
import owQuestionRoutes from './modules/ow-questions/owQuestion.routes';
import owQuestionTranslationRoutes from './modules/ow-question-translations/owQuestionTranslation.routes';
import owSynonymRoutes from './modules/ow-synonyms/owSynonym.routes';
import owSynonymTranslationRoutes from './modules/ow-synonym-translations/owSynonymTranslation.routes';
import descQuestionRoutes from './modules/desc-questions/descQuestion.routes';
import descQuestionTranslationRoutes from './modules/desc-question-translations/descQuestionTranslation.routes';
import matchingQuestionRoutes from './modules/matching-questions/matchingQuestion.routes';
import matchingQuestionTranslationRoutes from './modules/matching-question-translations/matchingQuestionTranslation.routes';
import matchingPairRoutes from './modules/matching-pairs/matchingPair.routes';
import matchingPairTranslationRoutes from './modules/matching-pair-translations/matchingPairTranslation.routes';
import orderingQuestionRoutes from './modules/ordering-questions/orderingQuestion.routes';
import orderingQuestionTranslationRoutes from './modules/ordering-question-translations/orderingQuestionTranslation.routes';
import orderingItemRoutes from './modules/ordering-items/orderingItem.routes';
import orderingItemTranslationRoutes from './modules/ordering-item-translations/orderingItemTranslation.routes';
import exerciseRoutes from './modules/assessments/assessment.routes';
import exerciseTranslationRoutes from './modules/assessment-translations/assessmentTranslation.routes';
import miniProjectRoutes from './modules/mini-projects/miniProject.routes';
import miniProjectTranslationRoutes from './modules/mini-project-translations/miniProjectTranslation.routes';
import miniProjectSolutionRoutes from './modules/mini-project-solutions/miniProjectSolution.routes';
import capstoneProjectRoutes from './modules/capstone-projects/capstoneProject.routes';
import capstoneProjectTranslationRoutes from './modules/capstone-project-translations/capstoneProjectTranslation.routes';
import capstoneProjectSolutionRoutes from './modules/capstone-project-solutions/capstoneProjectSolution.routes';
import webinarRoutes from './modules/webinars/webinar.routes';
import webinarTranslationRoutes from './modules/webinar-translations/webinarTranslation.routes';
import referralCodeRoutes from './modules/referral-codes/referralCode.routes';
import myReferralRoutes from './modules/my-referral/myReferral.routes';
import publicPromotionRoutes from './modules/public-promotions/publicPromotion.routes';
import publicContentRoutes from './modules/public-content/publicContent.routes';
import referralUsageRoutes from './modules/referral-usages/referralUsage.routes';
import referralRewardRoutes from './modules/referral-rewards/referralReward.routes';
import couponRoutes from './modules/coupons/coupon.routes';
import couponCourseRoutes from './modules/coupon-courses/couponCourse.routes';
import couponBundleRoutes from './modules/coupon-bundles/couponBundle.routes';
import couponBatchRoutes from './modules/coupon-batches/couponBatch.routes';
import couponWebinarRoutes from './modules/coupon-webinars/couponWebinar.routes';
import instructorPromotionRoutes from './modules/instructor-promotions/instructorPromotion.routes';
import instructorPromotionCourseRoutes from './modules/instructor-promotion-courses/instructorPromotionCourse.routes';
import authoringRoutes from './modules/authoring/authoring.routes';
import cartRoutes from './modules/cart/cart.routes';
import wishlistRoutes from './modules/wishlists/wishlist.routes';
import orderRoutes from './modules/orders/order.routes';
import paymentRoutes from './modules/payments/payment.routes';
import transactionRoutes from './modules/transactions/transaction.routes';
import enrollmentRoutes from './modules/enrollments/enrollment.routes';
import invoiceRoutes from './modules/invoices/invoice.routes';
import refundRoutes from './modules/refunds/refund.routes';
import checkoutRoutes from './modules/checkout/checkout.routes';
import revenueDashboardRoutes from './modules/revenue-dashboard/revenueDashboard.routes';
import studentProgressRoutes from './modules/student-progress/studentProgress.routes';
import certificateTemplateRoutes from './modules/certificate-templates/certificateTemplate.routes';
import issuedCertificateRoutes from './modules/issued-certificates/issuedCertificate.routes';
import badgeRoutes from './modules/badges/badge.routes';
import userBadgeRoutes from './modules/user-badges/userBadge.routes';
import reviewRoutes from './modules/reviews/review.routes';
import publicReviewRoutes from './modules/public-reviews/publicReview.routes';
import reviewHelpfulnessRoutes from './modules/review-helpfulness/reviewHelpfulness.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import emailTemplateRoutes from './modules/notifications/emailTemplate.routes';
import notificationPreferenceRoutes from './modules/notifications/notificationPreference.routes';
import cronRoutes from './cron/cronRoutes';
import instructorEarningRoutes from './modules/instructor-earnings/instructorEarning.routes';
import revenueShareTierRoutes from './modules/revenue-share-tiers/revenueShareTier.routes';
import meDashboardRoutes from './modules/me-dashboard/meDashboard.routes';
import studioRoutes from './modules/studio/studio.routes';
import ideaCategoryRoutes from './modules/idea-categories/ideaCategory.routes';
import ideaRoutes from './modules/ideas/idea.routes';
import payoutRequestRoutes from './modules/payout-requests/payoutRequest.routes';
import payoutSettlementRoutes from './modules/payout-settlements/payoutSettlement.routes';
import discussionThreadRoutes from './modules/discussion-threads/discussionThread.routes';
import discussionReplyRoutes from './modules/discussion-replies/discussionReply.routes';
import liveSessionRoutes from './modules/live-sessions/liveSession.routes';
import sessionAttendanceRoutes from './modules/session-attendance/sessionAttendance.routes';
import sessionRecordingRoutes from './modules/session-recordings/sessionRecording.routes';
import faqCategoryRoutes from './modules/faq-categories/faqCategory.routes';
import faqRoutes from './modules/faqs/faq.routes';
import faqCategoryTranslationRoutes from './modules/faq-category-translations/faqCategoryTranslation.routes';
import faqTranslationRoutes from './modules/faq-translations/faqTranslation.routes';
import blogCategoryRoutes from './modules/blog-categories/blogCategory.routes';
import blogPostRoutes from './modules/blog-posts/blogPost.routes';
import blogReviewRoutes from './modules/blog-reviews/blogReview.routes';
import policyTypeRoutes from './modules/policy-types/policyType.routes';
import policyTypeTranslationRoutes from './modules/policy-type-translations/policyTypeTranslation.routes';
import policyRoutes from './modules/policies/policy.routes';
import policyTranslationRoutes from './modules/policy-translations/policyTranslation.routes';
import ticketCategoryRoutes from './modules/ticket-categories/ticketCategory.routes';
import ticketPriorityRoutes from './modules/ticket-priorities/ticketPriority.routes';
import supportTicketRoutes from './modules/support-tickets/supportTicket.routes';
import ticketMessageRoutes from './modules/ticket-messages/ticketMessage.routes';
import ticketAttachmentRoutes from './modules/ticket-attachments/ticketAttachment.routes';
import userTicketRoutes from './modules/user-tickets/userTicket.routes';
import stickerCategoryRoutes from './modules/sticker-categories/stickerCategory.routes';
import stickerRoutes from './modules/stickers/sticker.routes';
import emojiCategoryRoutes from './modules/emoji-categories/emojiCategory.routes';
import customEmojiRoutes from './modules/custom-emojis/customEmoji.routes';
import quickReplyRoutes from './modules/quick-replies/quickReply.routes';
import chatRoomRoutes from './modules/chat-rooms/chatRoom.routes';
import chatMemberRoutes from './modules/chat-members/chatMember.routes';
import chatMessageRoutes from './modules/chat-messages/chatMessage.routes';
import chatReactionRoutes from './modules/chat-reactions/chatReaction.routes';
import chatReadReceiptRoutes from './modules/chat-read-receipts/chatReadReceipt.routes';
import chatInviteRoutes from './modules/chat-invites/chatInvite.routes';
import announcementRoutes from './modules/announcements/announcement.routes';
import podcastRoutes from './modules/podcasts/podcast.routes';
import walletRoutes from './modules/wallets/wallet.routes';
import walletTransactionRoutes from './modules/wallets/walletTransaction.routes';
import webhookRoutes from './modules/webhooks/webhook.routes';
import adminQueueRoutes from './modules/admin-queues/adminQueue.routes';
import verifyRoutes from './modules/verify/verify.routes';
import bankAccountRoutes from './modules/bank-accounts/bankAccount.routes';
import instructorPayoutRoutes from './modules/instructor-payouts/instructorPayout.routes';
import siteSettingsRoutes from './modules/site-settings/siteSettings.routes';
import adminRevenueRoutes from './modules/admin-revenue/adminRevenue.routes';
import adminDashboardsRoutes from './modules/admin-dashboards/adminDashboards.routes';
import searchRoutes from './modules/search/search.routes';
import pushDeviceRoutes from './modules/push-devices/pushDevice.routes';
import pushPublicRoutes from './modules/push-devices/pushPublic.routes';

const app = express();

// ── Security ──
app.use(helmet());
app.use(hpp());
app.use(compression());
app.use(cookieParser());
app.use(express.json({
  limit: '10mb',
  // Capture the exact raw bytes for webhook HMAC verification (Razorpay,
  // RazorpayX, Bunny). JSON.stringify(req.body) is NOT byte-identical to
  // what providers sign — key order and number formatting can differ.
  verify: (req, _res, buf) => { (req as any).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Phase 46 — defensively clamp `display_order` to a non-negative integer at the
// edge. Many admin forms expose a numeric display_order input; a negative value
// must never persist regardless of which controller handles the write.
app.use((req, _res, next) => {
  const b: any = req.body;
  if (b && typeof b === 'object' && !Array.isArray(b) && b.display_order !== undefined && b.display_order !== null && b.display_order !== '') {
    const n = Math.trunc(Number(b.display_order));
    if (!Number.isNaN(n)) b.display_order = n < 0 ? 0 : n;
  }
  next();
});

// ── CORS ──
//
// Accept three classes of origin so multi-developer LAN testing works
// without per-machine env tweaks:
//   1. Wildcard           — when CORS_ORIGINS contains '*' (open).
//   2. Explicit whitelist — exact-match entries from CORS_ORIGINS env.
//   3. Dev safe regex     — any localhost / 127.0.0.1 / 192.168.x.y origin
//                            with any port, so dev servers can swap ports
//                            (3000/3001/5001/7001/…) and teammates can hit
//                            the host via LAN IP without us reconfiguring.
//
// Production deployments should set CORS_ORIGINS to the real domains only
// (no '*'). The dev regex still accepts localhost/LAN origins, which is
// harmless in prod because no browser will be hitting a public API from
// localhost:7001 anyway — but if you want to lock it down completely,
// gate the regex on NODE_ENV !== 'production'.
const DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/i,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/i,
];
const corsWhitelist = config.cors.origins;
const corsOpen = corsWhitelist.includes('*');

app.use(cors({
  origin(origin, callback) {
    // No Origin header → same-origin / curl / server-to-server. Allow.
    if (!origin) return callback(null, true);
    if (corsOpen) return callback(null, true);
    if (corsWhitelist.includes(origin)) return callback(null, true);
    if (DEV_ORIGIN_PATTERNS.some((re) => re.test(origin))) return callback(null, true);
    // Reject — express-cors will omit the Allow-Origin header so the
    // browser blocks the response with a clear CORS error.
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-recaptcha-token'],
}));

// ── Rate Limiting ──
app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore('global'), // cluster-safe (shared via Redis)
}));

// ── Activity Logger ──
app.use(activityLogger);

// ── Health Check ──
app.get('/health', (_req, res) => res.json({ status: 'ok', app: config.appName, version: config.apiVersion, timestamp: new Date().toISOString() }));

// ── Prometheus metrics (Phase 7.6) ──
// Mounted before auth/RBAC so a Prometheus scraper can hit it.
// Lock down at the network layer (private VPC / METRICS_ALLOWED_IPS).
if (config.metrics.enabled) {
  app.get('/metrics', async (req, res) => {
    if (config.metrics.allowedIps.length > 0) {
      const callerIp = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (!config.metrics.allowedIps.includes(callerIp)) {
        return res.status(403).type('text/plain').send('forbidden');
      }
    }
    const { registry, refreshQueueDepthGauge } = await import('./services/metrics.service');
    try { await refreshQueueDepthGauge(); } catch { /* swallow */ }
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });
}

// ── API Docs (Swagger UI) ──
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'GrowUpMore API Docs',
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

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
app.use(`${api}/instructor-profiles`,        instructorProfileRoutes);
app.use(`${api}/subjects`,                    subjectRoutes);
app.use(`${api}/chapters`,                    chapterRoutes);
app.use(`${api}/topics`,                      topicRoutes);
app.use(`${api}/subject-translations`,        subjectTranslationRoutes);
app.use(`${api}/chapter-translations`,        chapterTranslationRoutes);
app.use(`${api}/topic-translations`,          topicTranslationRoutes);
app.use(`${api}/sub-topics`,                  subTopicRoutes);
app.use(`${api}/sub-topic-translations`,      subTopicTranslationRoutes);
app.use(`${api}/ai`,                        aiRoutes);
app.use(`${api}/resume`,                    resumeRoutes);
app.use(`${api}/material-tree`,             materialTreeRoutes);
app.use(`${api}/youtube-descriptions`,     youtubeDescriptionRoutes);
app.use(`${api}/courses`,                  courseRoutes);
app.use(`${api}/course-translations`,      courseTranslationRoutes);
app.use(`${api}/course-sub-categories`,    courseSubCategoryRoutes);
app.use(`${api}/course-modules`,           courseModuleRoutes);
app.use(`${api}/course-module-translations`, courseModuleTranslationRoutes);
app.use(`${api}/course-module-subjects`,     courseModuleSubjectRoutes);
app.use(`${api}/course-chapters`,            courseChapterRoutes);
app.use(`${api}/course-chapter-topics`,      courseChapterTopicRoutes);
app.use(`${api}/bundles`,                    bundleRoutes);
app.use(`${api}/bundle-translations`,        bundleTranslationRoutes);
app.use(`${api}/bundle-courses`,             bundleCourseRoutes);
app.use(`${api}/course-batches`,             courseBatchRoutes);
app.use(`${api}/batch-translations`,         batchTranslationRoutes);
app.use(`${api}/mcq-questions`,              mcqQuestionRoutes);
app.use(`${api}/mcq-question-translations`,  mcqQuestionTranslationRoutes);
app.use(`${api}/mcq-options`,                mcqOptionRoutes);
app.use(`${api}/mcq-option-translations`,    mcqOptionTranslationRoutes);
app.use(`${api}/ow-questions`,               owQuestionRoutes);
app.use(`${api}/ow-question-translations`,   owQuestionTranslationRoutes);
app.use(`${api}/ow-synonyms`,               owSynonymRoutes);
app.use(`${api}/ow-synonym-translations`,    owSynonymTranslationRoutes);
app.use(`${api}/desc-questions`,              descQuestionRoutes);
app.use(`${api}/desc-question-translations`,  descQuestionTranslationRoutes);
app.use(`${api}/matching-questions`,              matchingQuestionRoutes);
app.use(`${api}/matching-question-translations`,  matchingQuestionTranslationRoutes);
app.use(`${api}/matching-pairs`,                  matchingPairRoutes);
app.use(`${api}/matching-pair-translations`,      matchingPairTranslationRoutes);
app.use(`${api}/ordering-questions`,              orderingQuestionRoutes);
app.use(`${api}/ordering-question-translations`,  orderingQuestionTranslationRoutes);
app.use(`${api}/ordering-items`,                  orderingItemRoutes);
app.use(`${api}/ordering-item-translations`,      orderingItemTranslationRoutes);
app.use(`${api}/assessment-exercises`,               exerciseRoutes);
app.use(`${api}/assessment-exercise-translations`,   exerciseTranslationRoutes);
app.use(`${api}/assessment-mini-projects`,           miniProjectRoutes);
app.use(`${api}/assessment-mini-project-translations`, miniProjectTranslationRoutes);
app.use(`${api}/assessment-mini-project-solutions`,  miniProjectSolutionRoutes);
app.use(`${api}/assessment-capstone-projects`,           capstoneProjectRoutes);
app.use(`${api}/assessment-capstone-project-translations`, capstoneProjectTranslationRoutes);
app.use(`${api}/assessment-capstone-project-solutions`,  capstoneProjectSolutionRoutes);
app.use(`${api}/webinars`,                              webinarRoutes);
app.use(`${api}/webinar-translations`,                  webinarTranslationRoutes);
app.use(`${api}/referral-codes`,                        referralCodeRoutes);
app.use(`${api}/my/referral`,                           myReferralRoutes);
app.use(`${api}/public-promotions`,                     publicPromotionRoutes);
app.use(`${api}/public-content`,                        publicContentRoutes);
app.use(`${api}/referral-usages`,                       referralUsageRoutes);
app.use(`${api}/referral-rewards`,                      referralRewardRoutes);
app.use(`${api}/coupons`,                               couponRoutes);
app.use(`${api}/coupon-courses`,                        couponCourseRoutes);
app.use(`${api}/coupon-bundles`,                        couponBundleRoutes);
app.use(`${api}/coupon-batches`,                        couponBatchRoutes);
app.use(`${api}/coupon-webinars`,                       couponWebinarRoutes);
app.use(`${api}/instructor-promotions`,                  instructorPromotionRoutes);
app.use(`${api}/instructor-promotion-courses`,           instructorPromotionCourseRoutes);
app.use(`${api}/authoring`,                              authoringRoutes);
app.use(`${api}/cart-items`,                               cartRoutes);
app.use(`${api}/wishlists`,                                wishlistRoutes);
app.use(`${api}/orders`,                                   orderRoutes);
app.use(`${api}/payments`,                                 paymentRoutes);
app.use(`${api}/transactions`,                             transactionRoutes);
app.use(`${api}/enrollments`,                              enrollmentRoutes);
app.use(`${api}/invoices`,                                 invoiceRoutes);
app.use(`${api}/refunds`,                                  refundRoutes);
app.use(`${api}/checkout`,                                 checkoutRoutes);
app.use(`${api}/revenue-dashboard`,                        revenueDashboardRoutes);
app.use(`${api}/student-progress`,                         studentProgressRoutes);
app.use(`${api}/certificate-templates`,                    certificateTemplateRoutes);
app.use(`${api}/issued-certificates`,                      issuedCertificateRoutes);
app.use(`${api}/badges`,                                   badgeRoutes);
app.use(`${api}/user-badges`,                              userBadgeRoutes);
app.use(`${api}/reviews`,                                  reviewRoutes);
app.use(`${api}/public-reviews`,                           publicReviewRoutes);
app.use(`${api}/review-helpfulness`,                       reviewHelpfulnessRoutes);
app.use(`${api}/notifications`,                            notificationRoutes);
app.use(`${api}/email-templates`,                          emailTemplateRoutes);
app.use(`${api}/notification-preferences`,                 notificationPreferenceRoutes);
app.use(`${api}/cron`,                                     cronRoutes);
app.use(`${api}/instructor-earnings`,                      instructorEarningRoutes);
app.use(`${api}/revenue-share-tiers`,                      revenueShareTierRoutes);
app.use(`${api}/dashboard`,                                meDashboardRoutes);
app.use(`${api}/studio`,                                   studioRoutes);
app.use(`${api}/idea-categories`,                          ideaCategoryRoutes);
app.use(`${api}/ideas`,                                    ideaRoutes);
app.use(`${api}/payout-requests`,                          payoutRequestRoutes);
app.use(`${api}/payout-settlements`,                       payoutSettlementRoutes);
app.use(`${api}/discussion-threads`,                       discussionThreadRoutes);
app.use(`${api}/discussion-replies`,                       discussionReplyRoutes);
app.use(`${api}/live-sessions`,                            liveSessionRoutes);
app.use(`${api}/session-attendance`,                       sessionAttendanceRoutes);
app.use(`${api}/session-recordings`,                       sessionRecordingRoutes);
app.use(`${api}/faq-categories`,                           faqCategoryRoutes);
app.use(`${api}/faqs`,                                     faqRoutes);
app.use(`${api}/faq-category-translations`,                faqCategoryTranslationRoutes);
app.use(`${api}/faq-translations`,                         faqTranslationRoutes);
app.use(`${api}/blog-categories`,                          blogCategoryRoutes);
app.use(`${api}/blog-posts`,                               blogPostRoutes);
app.use(`${api}/blog-reviews`,                             blogReviewRoutes);
app.use(`${api}/policy-types`,                             policyTypeRoutes);
app.use(`${api}/policy-type-translations`,                 policyTypeTranslationRoutes);
app.use(`${api}/policies`,                                 policyRoutes);
app.use(`${api}/policy-translations`,                      policyTranslationRoutes);
app.use(`${api}/ticket-categories`,                        ticketCategoryRoutes);
app.use(`${api}/ticket-priorities`,                        ticketPriorityRoutes);
app.use(`${api}/support-tickets`,                          supportTicketRoutes);
app.use(`${api}/ticket-messages`,                          ticketMessageRoutes);
app.use(`${api}/ticket-attachments`,                       ticketAttachmentRoutes);
app.use(`${api}/user-tickets`,                             userTicketRoutes);
app.use(`${api}/sticker-categories`,                       stickerCategoryRoutes);
app.use(`${api}/stickers`,                                 stickerRoutes);
app.use(`${api}/emoji-categories`,                         emojiCategoryRoutes);
app.use(`${api}/custom-emojis`,                            customEmojiRoutes);
app.use(`${api}/quick-replies`,                            quickReplyRoutes);
app.use(`${api}/chat-rooms`,                               chatRoomRoutes);
app.use(`${api}/chat-members`,                             chatMemberRoutes);
app.use(`${api}/chat-messages`,                            chatMessageRoutes);
app.use(`${api}/chat-reactions`,                           chatReactionRoutes);
app.use(`${api}/chat-read-receipts`,                       chatReadReceiptRoutes);
app.use(`${api}/chat-invites`,                             chatInviteRoutes);
app.use(`${api}/announcements`,                            announcementRoutes);
app.use(`${api}/podcasts`,                                 podcastRoutes);
app.use(`${api}/wallets`,                                  walletRoutes);
app.use(`${api}/wallet-transactions`,                      walletTransactionRoutes);
app.use(`${api}/webhooks`,                                 webhookRoutes);
app.use(`${api}/admin/queues`,                             adminQueueRoutes);
app.use(`${api}/verify`,                                   verifyRoutes);
app.use(`${api}/bank-accounts`,                            bankAccountRoutes);
app.use(`${api}/instructor-payouts`,                       instructorPayoutRoutes);
app.use(`${api}/admin/revenue`,                            adminRevenueRoutes);
app.use(`${api}/admin/dashboards`,                         adminDashboardsRoutes);
app.use(`${api}/search`,                                   searchRoutes);
app.use(`${api}/push`,                                     pushPublicRoutes);
app.use(`${api}/push-devices`,                             pushDeviceRoutes);
app.use(`${api}/site-settings`,                            siteSettingsRoutes);

// ── 404 ──
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ── Global Error Handler ──
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  const message = config.env === 'production' ? 'Internal server error' : err.message;
  if (status >= 500) {
    logger.error({
      err,
      method: req.method,
      url: req.originalUrl,
      status,
      userId: (req as any).user?.id,
    }, `Unhandled ${status}: ${err.message}`);

    // Phase 7.5 — ship 5xx to Sentry (no-op when SENTRY_DSN not set)
    if (config.sentry.dsn) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.withScope((scope: any) => {
          scope.setTag('http.method', req.method);
          scope.setTag('http.status', String(status));
          scope.setContext('request', { url: req.originalUrl, ip: req.ip });
          if ((req as any).user?.id) scope.setUser({ id: String((req as any).user.id) });
          Sentry.captureException(err);
        });
      } catch { /* swallow */ }
    }
  } else {
    logger.warn({ method: req.method, url: req.originalUrl, status }, err.message);
  }
  res.status(status).json({ success: false, error: message });
});

export default app;
