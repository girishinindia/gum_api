# GrowUpMore API

Professional and future-ready **Node.js + Express + TypeScript** API starter with:

- modular monolith structure
- API versioning (`/api/v1`, `/api/v2`)
- centralized environment validation
- JWT auth scaffolding
- local upload support
- Redis/Supabase/Bunny/Brevo/Razorpay integration stubs
- clean error handling and logging

## 1) What is included

### Working now
- health endpoint
- auth register/login/refresh
- protected `users/me` endpoints
- local image/document upload endpoints
- standardized API response format
- version-ready routing

### Ready to extend
- Supabase client
- Redis client
- Bunny services
- Brevo email service
- SMS service
- Razorpay service
- reCAPTCHA service

## 2) Project structure

```bash
src/
  api/
    v1/
    v2/
  config/
  core/
  database/
  integrations/
  modules/
```

Business logic lives in `modules/`.
Version-specific transport logic lives in `api/v1` and `api/v2`.

---

## 3) How to run

### Step 1: Extract and open the project
```bash
cd growupmore-api
```

### Step 2: Create your environment file
Copy `.env.example` to `.env`.

**Linux / macOS**
```bash
cp .env.example .env
```

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

Now paste your real values into `.env`.

> Important: the secrets you shared earlier looked live. Rotate them before using them in production.

### Step 3: Install dependencies
```bash
npm install
```

### Step 4: Start development server
```bash
npm run dev
```

You should see the app on:
```bash
http://localhost:5001
```

### Step 5: Build for production
```bash
npm run build
npm start
```

---

## 4) Useful routes

### Base
- `GET /`

### Health
- `GET /api/v1/health`
- `GET /api/v2/health`

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

### Users
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`

### Uploads
- `POST /api/v1/uploads/image`
- `POST /api/v1/uploads/document`

---

## 5) Example requests

### Register
```bash
curl --location 'http://localhost:5001/api/v1/auth/register' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Girish",
  "email": "girish@example.com",
  "password": "Password@123"
}'
```

### Login
```bash
curl --location 'http://localhost:5001/api/v1/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "girish@example.com",
  "password": "Password@123"
}'
```

### Get current user
Replace `YOUR_ACCESS_TOKEN` with the access token returned by login.

```bash
curl --location 'http://localhost:5001/api/v1/users/me' \
--header 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

### Update current user
```bash
curl --location --request PATCH 'http://localhost:5001/api/v1/users/me' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
--data-raw '{
  "name": "Girish Kumar"
}'
```

### Upload image
```bash
curl --location 'http://localhost:5001/api/v1/uploads/image' \
--header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
--form 'file=@"/absolute/path/to/image.jpg"'
```

---

## 6) Notes about storage and database

This starter is designed to **run immediately** without forcing a DB migration first.

For quick local testing:
- auth/users use an in-memory repository
- uploads are stored locally in `/uploads`

For production:
- replace the in-memory repository with a Supabase/Postgres repository
- switch uploads from local disk to Bunny Storage
- store refresh tokens / OTPs in Redis
- wire email/SMS/reCAPTCHA/Razorpay services into auth and checkout flows

---

## 7) How to add API v2 later

Keep business logic in `modules/`.
Add new request/response contracts in `src/api/v2`.

Example:
- `src/api/v1/auth/auth.controller.ts`
- `src/api/v2/auth/auth.controller.ts`
- both can call `src/modules/auth/auth.service.ts`

This prevents duplication and keeps upgrades clean.

---

## 8) Recommended next steps

1. Replace in-memory users with Supabase-backed repository.
2. Add OTP module using Redis.
3. Move local uploads to Bunny Storage.
4. Add Razorpay order + verify endpoints.
5. Add Swagger or OpenAPI docs.
6. Add test coverage with Vitest + Supertest.

---

## 9) Production checklist

- rotate all secrets
- use separate `.env` per environment
- enable HTTPS behind reverse proxy
- restrict CORS for production domains only
- move uploads to Bunny Storage
- persist users/tokens/OTPs in real storage
- add structured monitoring and alerting
- enable request throttling for auth and OTP routes

---

## 10) Troubleshooting

### Port already in use
Change `PORT` in `.env`.

### Invalid environment variables
Check startup logs. The app validates `.env` on boot.

### Upload rejected
Make sure the file MIME type is listed in:
- `ALLOWED_IMAGE_TYPES`
- `ALLOWED_DOC_TYPES`

### 401 Unauthorized
Check that the Bearer token is valid and not expired.

---

## 11) Suggested commands

```bash
npm install
npm run dev
npm run build
npm start
```
