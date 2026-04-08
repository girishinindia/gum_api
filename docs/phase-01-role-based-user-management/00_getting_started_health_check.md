# GrowUpMore API — Getting Started & Health Check

## Postman Testing Guide

**Base URL (Local):** `http://localhost:5001`
**Base URL (Production):** `https://api.growupmore.com`
**API Prefix:** `/api/v1`
**Content-Type:** `application/json`

---

## Environment Variables Reference

### Required `.env` Variables

```env
# ─── Server ───────────────────────────────────────────────────
NODE_ENV=production                # development | test | production
PORT=5001
APP_URL=https://api.growupmore.com
API_VERSION=v1
APP_NAME=GrowUpMore API
TIMEZONE=Asia/Kolkata

# ─── Supabase / PostgreSQL ───────────────────────────────────
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres?sslmode=require

# ─── JWT ─────────────────────────────────────────────────────
JWT_ACCESS_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── CORS ────────────────────────────────────────────────────
CORS_ORIGINS=*                     # Comma-separated: https://app.growupmore.com,https://admin.growupmore.com

# ─── Redis (Upstash) ────────────────────────────────────────
UPSTASH_REDIS_URL=rediss://default:xxxxx@xxxxx.upstash.io:6379
REDIS_SESSION_TTL=1800             # 30 minutes
REDIS_CACHE_TTL=300                # 5 minutes
REDIS_OTP_TTL=600                  # 10 minutes

# ─── Bunny Storage ───────────────────────────────────────────
BUNNY_STORAGE_ZONE=xxxxx
BUNNY_STORAGE_KEY=xxxxx
BUNNY_STORAGE_URL=https://sg.storage.bunnycdn.com
BUNNY_CDN_URL=https://cdn.growupmore.com

# ─── Bunny Stream ────────────────────────────────────────────
BUNNY_STREAM_API_KEY=xxxxx
BUNNY_STREAM_LIBRARY_ID=xxxxx
BUNNY_STREAM_CDN=https://stream.growupmore.com
BUNNY_STREAM_TOKEN_KEY=xxxxx

# ─── Bunny Account ───────────────────────────────────────────
BUNNY_ACCOUNT_API_KEY=xxxxx

# ─── Email (Brevo) ───────────────────────────────────────────
BREVO_API_KEY=xkeysib-xxxxx
EMAIL_FROM=info@growupmore.com
EMAIL_FROM_NAME=Grow Up More
EMAIL_ADMIN=info@growupmore.com
EMAIL_ADMIN_NOTIFY=admin@growupmore.com

# ─── SMS (SMSGatewayHub) ────────────────────────────────────
SMS_API_KEY=xxxxx
SMS_SENDER_ID=GUMORE
SMS_ROUTE=clickhere
SMS_CHANNEL=2
SMS_DCS=0
SMS_FLASH=0
SMS_ENTITY_ID=xxxxx
SMS_DLT_TEMPLATE_ID=xxxxx

# ─── Razorpay ────────────────────────────────────────────────
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_CURRENCY=INR

# ─── reCAPTCHA (toggleable) ─────────────────────────────────
RECAPTCHA_ENABLED=false            # true = enforce, false = skip (default)
RECAPTCHA_SITE_KEY=xxxxx           # Only needed when RECAPTCHA_ENABLED=true
RECAPTCHA_SECRET_KEY=xxxxx
RECAPTCHA_API_KEY=xxxxx
RECAPTCHA_PROJECT_ID=xxxxx
RECAPTCHA_MIN_SCORE=0.5

# ─── Rate Limiting ───────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000        # 15 minutes
RATE_LIMIT_MAX=100                 # Global max per window
RATE_LIMIT_AUTH_MAX=100            # Auth endpoints max per window

# ─── File Upload ─────────────────────────────────────────────
MAX_FILE_SIZE_MB=50
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/gif,image/webp,image/svg+xml
ALLOWED_DOC_TYPES=application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document

# ─── Logging ─────────────────────────────────────────────────
LOG_LEVEL=info                     # debug | info | warn | error
LOG_DIR=logs

# ─── OTP ─────────────────────────────────────────────────────
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=3
OTP_MAX_ATTEMPTS=3
OTP_RESEND_COOLDOWN_SECONDS=60

# ─── Bcrypt ──────────────────────────────────────────────────
BCRYPT_SALT_ROUNDS=12

# ─── Default Language ────────────────────────────────────────
DEFAULT_LANG_CODE=en
DEFAULT_LANG_ID=1
```

---

## Deployment Guide

### Hosting Folder (`hosting/`)

| File | Purpose | Usage |
|------|---------|-------|
| `setup-growupmore-api.sh` | Full server setup (one-time) | `bash setup-growupmore-api.sh` |
| `deploy.sh` | Quick redeploy after `git push` | `bash ~/deploy.sh` |

### First-time Setup (on EC2 Ubuntu)

```bash
# Upload setup script to server and run:
bash setup-growupmore-api.sh
```

This script handles 12 phases automatically:
1. System update
2. Install Node.js 24 via NVM
3. Install PM2 & Nginx
4. Clone repo (auto-detects correct branch)
5. Create `.env` file
6. Install npm packages
7. Build TypeScript → `dist/`
8. PM2 setup with auto-restart
9. Nginx reverse proxy config
10. SSL via Let's Encrypt (auto-checks DNS)
11. Create `~/deploy.sh` for future updates
12. Final health check

### Subsequent Deploys (after every `git push`)

```bash
# SSH into server, then:
bash ~/deploy.sh
```

The deploy script:
- Pulls latest code (shows new commits)
- Runs `npm install` only if `package.json` changed
- Rebuilds TypeScript
- Restarts PM2
- Verifies service is online

### Useful PM2 Commands

```bash
pm2 status                            # App status
pm2 logs growupmore-api               # Live logs
pm2 logs growupmore-api --lines 50    # Last 50 lines
pm2 restart growupmore-api            # Restart app
pm2 monit                             # Live monitoring dashboard
```

---

## Production Notes

### Trust Proxy
The app auto-enables `trust proxy` in production for correct IP detection behind Nginx. This ensures rate limiting uses the client's real IP (from `X-Forwarded-For`), not `127.0.0.1`.

### IPv4 Forced
DNS resolution is forced to IPv4-first (`dns.setDefaultResultOrder('ipv4first')`) because Supabase DNS resolves to IPv6, which many EC2 instances cannot reach.

### SSL for PostgreSQL
The DATABASE_URL should include `?sslmode=require` for production connections to Supabase. The `pg` pool also enables SSL automatically when `NODE_ENV=production`.

### reCAPTCHA Toggle
reCAPTCHA is **disabled by default** (`RECAPTCHA_ENABLED=false`). This allows Postman testing without a frontend. To enforce in production, set `RECAPTCHA_ENABLED=true` in `.env` and restart PM2. See the Auth API documentation (01) for full details.

---

## Step 0: Verify Server Health

Before testing any endpoints, verify the server and all services are running.

### Health Check

**`GET /api/v1/health`**

**No authentication required.**

**Headers:**
```
(none required)
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Healthy",
  "data": {
    "status": "healthy",
    "timestamp": "2026-04-08T12:00:00.000Z",
    "uptime": 12345,
    "environment": "production",
    "version": "1.0.0",
    "services": {
      "database": {
        "status": "connected",
        "latency": "12ms"
      },
      "redis": {
        "status": "connected",
        "latency": "3ms"
      }
    }
  }
}
```

**Postman Tests:**
```javascript
pm.test("Status is 200", () => pm.response.to.have.status(200));
const json = pm.response.json();
pm.test("Server is healthy", () => pm.expect(json.data.status).to.equal("healthy"));
pm.test("Database connected", () => pm.expect(json.data.services.database.status).to.equal("connected"));
pm.test("Redis connected", () => pm.expect(json.data.services.redis.status).to.equal("connected"));
```

**Possible Errors:**

*Server not running (Connection refused):*
```
Could not get any response. There was an error connecting to http://localhost:5001/api/v1/health
```
> **Fix:** Start the server with `npm run dev` (local) or check `pm2 status` (production).

*Database connection failed (200 with degraded status):*
```json
{
  "success": true,
  "message": "Healthy",
  "data": {
    "status": "degraded",
    "services": {
      "database": { "status": "disconnected", "error": "Connection refused" },
      "redis": { "status": "connected" }
    }
  }
}
```
> **Fix:** Check `DATABASE_URL` in `.env`. Ensure `?sslmode=require` is appended for Supabase. Check PM2 logs: `pm2 logs growupmore-api --lines 30`

*IPv6 network unreachable (500 on any DB query):*
```json
{
  "success": false,
  "message": "Internal server error"
}
```
> PM2 log shows: `ENETUNREACH`, `address: "2406:da1a:..."`, `port: 5432`
> **Fix:** This means the server is trying to connect via IPv6. The code forces IPv4 via `dns.setDefaultResultOrder('ipv4first')` in `pg-pool.ts`. Ensure you've deployed the latest code.

*Redis connection failed:*
> **Fix:** Check `UPSTASH_REDIS_URL` in `.env` and verify Redis is accessible.

*Rate limiter error (500 — X-Forwarded-For):*
> PM2 log shows: `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`
> **Fix:** The app must have `trust proxy` enabled. This is set automatically in `app.ts` when `NODE_ENV=production`. Ensure you've deployed the latest code.
