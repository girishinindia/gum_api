# GrowUpMore API

Professional Node.js Express (TypeScript) API with RBAC, OTP Auth, Activity Logs.

## Stack
- **Runtime**: Node.js 20+ / TypeScript
- **Framework**: Express 4
- **Database**: PostgreSQL (Supabase as host, service_role access)
- **Cache**: Redis (Upstash)
- **Email**: Brevo (Sendinblue)
- **SMS**: SMS Gateway Hub (DLT compliant)
- **Storage**: Bunny.net CDN (Sharp for WebP conversion)
- **Auth**: JWT (access 15m + refresh 7d) + Dual OTP
- **Validation**: Zod
- **Logging**: Pino
- **reCAPTCHA**: Google (toggleable via env)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your actual keys

# 3. Run SQL migrations in Supabase SQL Editor (in order!)
#    sql/01_rbac.sql
#    sql/02_auth_countries_logs.sql

# 4. Start development server
npm run dev
```

## API Routes

### Auth (Public)
```
POST /api/v1/auth/register     → { first_name, last_name, email, mobile, password }
POST /api/v1/auth/verify-otp   → { pending_id, channel: 'email'|'mobile', otp }
POST /api/v1/auth/resend-otp   → { pending_id, channel: 'email'|'mobile' }
POST /api/v1/auth/login        → { identifier, password }
POST /api/v1/auth/refresh      → { refresh_token }
POST /api/v1/auth/logout       → { refresh_token }  (auth required)
```

### Users (Auth + RBAC)
```
GET    /api/v1/users/me                    → Current user profile
GET    /api/v1/users                       → List (user:read)
GET    /api/v1/users/:id                   → Detail (user:read)
PUT    /api/v1/users/:id                   → Update (user:update)
PATCH  /api/v1/users/:id/status            → Suspend/activate (user:update)
POST   /api/v1/users/:id/roles             → Assign role (user:manage_role)
DELETE /api/v1/users/:id/roles/:roleId     → Revoke role (user:manage_role)
POST   /api/v1/users/:id/revoke-sessions   → Force logout (session:delete)
```

### Roles (Auth + RBAC)
```
GET    /api/v1/roles          → List (role:read)
GET    /api/v1/roles/:id      → Detail with permissions (role:read)
POST   /api/v1/roles          → Create (role:create)
PUT    /api/v1/roles/:id      → Update (role:update)
DELETE /api/v1/roles/:id      → Delete (role:delete)
```

### Permissions (Auth + RBAC)
```
GET    /api/v1/permissions              → List all (permission:read)
GET    /api/v1/permissions/grouped      → Grouped by resource (permission:read)
PATCH  /api/v1/permissions/:id/toggle-active → Activate/deactivate (permission:manage_permission)
```

### Countries (Public read, Auth + RBAC for write)
```
GET    /api/v1/countries                → List (public, Redis cached)
GET    /api/v1/countries/:id            → Detail (public)
POST   /api/v1/countries                → Create (country:create)
PUT    /api/v1/countries/:id            → Update (country:update)
DELETE /api/v1/countries/:id            → Delete (country:delete)
POST   /api/v1/countries/:id/flag       → Upload flag image (country:update)
PATCH  /api/v1/countries/:id/toggle-active → Activate/deactivate (country:update)
```

### Activity Logs (Auth + RBAC: activity_log:read)
```
GET /api/v1/activity-logs/auth     → Auth events (login, OTP, register)
GET /api/v1/activity-logs/admin    → Admin actions (role changes, user management)
GET /api/v1/activity-logs/data     → Data CRUD (courses, media, payments)
GET /api/v1/activity-logs/system   → System events (errors, rate limits)
```

Query params for all logs: `?page=1&limit=50&action=login_success&user_id=1&from=2025-01-01&to=2025-12-31`

## Registration Flow

1. User submits form → API validates, stores in Redis, sends dual OTP
2. User verifies email OTP → `POST /verify-otp { channel: 'email' }`
3. User verifies mobile OTP → `POST /verify-otp { channel: 'mobile' }`
4. Both verified → User created in PostgreSQL, JWT issued, student role assigned

## Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| super_admin | 100 | Full access (Girish only) |
| admin | 80 | Manage users, content, settings |
| faculty | 60 | Manage assigned courses |
| moderator | 40 | Review content |
| student | 20 | Learn |
| guest | 0 | Public content |

Higher level inherits all permissions of lower levels.
