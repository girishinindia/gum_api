import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'GrowUpMore API',
      version: '1.0.0',
      description:
        'Enterprise E-Learning Platform REST API. Provides endpoints for authentication, user management, courses, assessments, payments, chat, and more.',
      contact: { name: 'GrowUpMore Team', email: 'info@growupmore.com' },
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/${config.apiVersion}`,
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token obtained from /auth/login or /auth/verify-otp',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: { type: 'string' },
              description: 'Field-level error messages (optional)',
            },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 10 },
                total: { type: 'integer', example: 100 },
                totalPages: { type: 'integer', example: 10 },
              },
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Registration, login, OTP, password reset' },
      { name: 'Users', description: 'User management' },
      { name: 'Profile', description: 'Current user profile' },
      { name: 'Roles & Permissions', description: 'RBAC management' },
      { name: 'Geography', description: 'Countries, states, cities' },
      { name: 'Master Data', description: 'Skills, languages, education levels, designations, specializations, learning goals, document types, social media types' },
      { name: 'Branches & Departments', description: 'Organizational structure' },
      { name: 'Categories', description: 'Course categories and sub-categories (with translations)' },
      { name: 'Subjects & Curriculum', description: 'Subjects, chapters, topics, sub-topics (with translations)' },
      { name: 'Courses', description: 'Courses, modules, batches, bundles (with translations)' },
      { name: 'Assessments', description: 'MCQ, one-word, descriptive, matching, ordering questions; exercises, mini-projects, capstone projects' },
      { name: 'Content', description: 'Webinars, blog posts, FAQs, policies, announcements, YouTube descriptions' },
      { name: 'Commerce', description: 'Cart, wishlists, orders, payments, transactions, invoices, refunds, checkout, coupons, referrals' },
      { name: 'Enrollments & Progress', description: 'Enrollments, student progress, certificates, badges' },
      { name: 'Instructor', description: 'Instructor earnings, payouts, promotions' },
      { name: 'Reviews', description: 'Course and blog reviews' },
      { name: 'Support', description: 'Tickets, ticket messages, ticket attachments' },
      { name: 'Chat', description: 'Chat rooms, members, messages, reactions, read receipts, invites, stickers, emojis, quick replies' },
      { name: 'Notifications', description: 'Notifications, email templates, notification preferences' },
      { name: 'Wallets', description: 'User wallets and wallet transactions' },
      { name: 'Live Sessions', description: 'Live sessions, attendance, recordings' },
      { name: 'AI & Tools', description: 'AI features, resume builder, material tree' },
      { name: 'Admin', description: 'Activity logs, table summary, cron jobs, revenue dashboard' },
    ],
  },
  apis: ['./src/modules/**/**.routes.ts', './src/cron/cronRoutes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
