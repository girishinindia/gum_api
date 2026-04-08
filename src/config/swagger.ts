import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GrowUpMore API',
      version: '1.0.0',
      description:
        'GrowUpMore — Ed-Tech Platform REST API. ' +
        'Covers authentication (OTP-based registration, login, password/email/mobile change), ' +
        'RBAC (users, roles, modules, permissions, role-permissions, user-role-assignments), ' +
        'menu management, audit logging, and file uploads.',
      contact: {
        name: 'GrowUpMore Support',
        email: 'info@growupmore.com'
      }
    },
    servers: [
      { url: `http://localhost:${env.PORT}`, description: 'Local development' },
      { url: env.APP_URL, description: 'Production' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your access token from the /auth/login endpoint'
        }
      },
      schemas: {
        // ─── Shared response shapes ─────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            code: { type: 'string' }
          }
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'array', items: { type: 'object' } },
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                totalCount: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    },
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Auth', description: 'Authentication — registration, login, logout, password/email/mobile change' },
      { name: 'Users', description: 'User management (admin CRUD + self-profile)' },
      { name: 'Roles', description: 'Role management' },
      { name: 'Modules', description: 'Module management' },
      { name: 'Permissions', description: 'Permission management' },
      { name: 'Role Permissions', description: 'Role-permission mapping (assign / remove / replace)' },
      { name: 'User Role Assignments', description: 'User-role assignment management with context support' },
      { name: 'Menu Items', description: 'Menu item management with hierarchy' },
      { name: 'Role Change Log', description: 'Audit log for role changes' },
      { name: 'Uploads', description: 'File upload (images and documents)' }
    ]
  },
  apis: ['./src/api/v1/**/*.routes.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
