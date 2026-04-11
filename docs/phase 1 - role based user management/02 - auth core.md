# Phase 1 — Authentication (core)

The bread-and-butter spine: register, log in, refresh, log out, and "who am I". For password resets, contact verification, and email/mobile changes see the next file.

← [01 health](01%20-%20health.md) · **Next →** [03 auth otp flows](03%20-%20auth%20otp%20flows.md)

---

## 2.1 `POST /api/v1/auth/register`

Public. Creates a new account with role `student` or `instructor` and emits OTPs (one to email, one to mobile) so the user can verify both contact channels.

> **Side effect → email.** On success, fires `mailer.sendOtp(..., flow='register')` to the new user's email address. Best-effort: a Brevo failure logs at WARN but does not roll back the registration. See [11 — email notifications](11%20-%20email%20notifications.md).

> **Side effect → SMS.** On success, the mobile OTP is dispatched via the shared `sendMobileOtp(...)` helper through SMSGatewayHub. The helper only fires when `NODE_ENV === 'production'` **OR** the `SMS_FORCE_SEND` env flag is `true` — both unset means it's a no-op and the dev OTP echo channel (`devMobileOtp` in the response + `logger.info` line) is how local dev/test picks up the code. Failures are log-and-continue: a flaky gateway never rolls back the registration. See [03 auth otp flows](03%20-%20auth%20otp%20flows.md#sms-dispatch-gate).

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | yes | 1–128 chars, no control characters. |
| `lastName` | string | yes | Same. |
| `email` | string | one of email/mobile | RFC-valid, lowercased server-side. |
| `mobile` | string | one of email/mobile | 8–20 chars, digits with optional leading `+`. |
| `password` | string | yes | 8–128 chars, at least one upper, one lower, one digit. |
| `roleCode` | enum | no (default `student`) | `student` or `instructor`. Other roles must be created by an admin. |
| `countryId` | int | no (default `1`) | FK into `countries`; controls the OTP destination's country code. |

**Sample request**

```json
{
  "firstName": "Asha",
  "lastName": "Patel",
  "email": "asha.patel@example.com",
  "mobile": "9662278990",
  "password": "Welcome@2026",
  "roleCode": "student",
  "countryId": 1
}
```

**Response 201 (development)**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": 42,
    "emailOtpId": 7821,
    "mobileOtpId": 7822,
    "devEmailOtp": "493017",
    "devMobileOtp": "820146"
  }
}
```

> In **production** `devEmailOtp` and `devMobileOtp` are `null`. `emailOtpId` and `mobileOtpId` are always returned — the client needs them to call the verify routes in §2.1a and §2.1b. The mobile OTP is dispatched to the E.164 destination `+919662278990` (country `+91` joined with the local number).

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body failed Zod validation (e.g., weak password, neither email nor mobile supplied). |
| 400 | `REGISTRATION_FAILED` | UDF refused (e.g., self-register tried for an admin role). |
| 409 | `DUPLICATE_ENTRY` | Email or mobile already registered. |

---

## What happens between register and login

A freshly-registered user **cannot log in** until both `is_email_verified` AND `is_mobile_verified` are `true`. The gate is enforced at the database layer by `udf_auth_login` (see `phase-01-role-based-user-management/12-auth/04_fn_login.sql` lines 143–185) — if either flag is `false`, the UDF refuses and returns `{ success: false, failure_reason, unverified_channels }`. The Node `login()` wrapper surfaces this as `403 ACCOUNT_NOT_VERIFIED` with a `details` object the client can route on. See §2.2 "Errors" for the exact shape.

The canonical sequence is:

```
1.  POST /auth/register
       ↓  response contains { userId, emailOtpId, mobileOtpId, devEmailOtp?, devMobileOtp? }
       ↓  no JWT issued

2a. POST /auth/register/verify-email        (public, §2.1a below)
       body: { userId, otpId: emailOtpId, otpCode }
       ↓  marks is_email_verified = true

2b. POST /auth/register/verify-mobile       (public, §2.1b below)
       body: { userId, otpId: mobileOtpId, otpCode }
       ↓  marks is_mobile_verified = true

3.  POST /auth/login                        (§2.2 below)
       ↓  DB gate passes because both flags are now true
       ↓  returns { accessToken, refreshToken, user }
```

**If an OTP expired or never arrived**, the user can call the public resend routes `POST /auth/register/resend-email` (§2.1c) and `POST /auth/register/resend-mobile` (§2.1d) with just `{ userId }` — the server looks up the pending row and generates a fresh OTP, subject to the 3-min wait / max-3-resends / 30-min cooldown rules in [03 auth otp flows §3.8](03%20-%20auth%20otp%20flows.md#38-otp-resend-rules). The resend response returns a new `otpId` which replaces the original `emailOtpId`/`mobileOtpId` on the next verify call.

The verify-email and verify-mobile routes in [03 auth otp flows](03%20-%20auth%20otp%20flows.md#33-verify-email--authenticated-single-channel) §3.3 and §3.4 are the **re-verification** path for already-logged-in users (profile update, email change, etc.) — they require a JWT, and have their own authenticated resend routes in §3.3c and §3.4c. The §2.1a–§2.1d routes below are the **first-time verification** path for newly-registered users, and they are public by design because the user cannot hold a JWT until both flags flip.

---

## 2.1a `POST /api/v1/auth/register/verify-email`

Public. Marks a newly-registered user's email as verified. Takes the `userId` + `emailOtpId` returned by `/auth/register` plus the OTP code the user received by email.

> **Security shape.** The service layer binds the OTP row to the claimed `userId` before calling `udf_auth_verify_email`. It refuses if (a) the OTP row does not exist, (b) the OTP row belongs to a different user, (c) the OTP channel is `mobile` (wrong route), or (d) the OTP `purpose` is not `registration`. All four cases return `400 OTP_INVALID` to avoid leaking which condition failed.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | int | yes | From the `/auth/register` response. |
| `otpId` | int | yes | The `emailOtpId` from the `/auth/register` response. |
| `otpCode` | string | yes | 4–8 digits. Delivered to the user's email via Brevo. |

**Sample request**

```json
{ "userId": 42, "otpId": 7821, "otpCode": "493017" }
```

**Response 200**

```json
{
  "success": true,
  "message": "Email verified",
  "data": { "userId": 42, "isEmailVerified": true }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body shape is wrong (missing field, OTP not 4–8 digits, etc.). |
| 400 | `OTP_INVALID` | OTP row doesn't belong to this user, wrong channel, wrong purpose, or wrong code. |
| 404 | `OTP_NOT_FOUND` | `otpId` does not exist. |
| 410 | `OTP_EXPIRED` | OTP older than 10 minutes, or already consumed by a previous successful verify. |
| 429 | `OTP_EXHAUSTED` | 5 wrong attempts on this OTP row. Must request a resend via the forgot-password flow. |

---

## 2.1b `POST /api/v1/auth/register/verify-mobile`

Public. Same shape as §2.1a but for the mobile channel. Uses `mobileOtpId` from the `/auth/register` response.

**Sample request**

```json
{ "userId": 42, "otpId": 7822, "otpCode": "820146" }
```

**Response 200**

```json
{
  "success": true,
  "message": "Mobile verified",
  "data": { "userId": 42, "isMobileVerified": true }
}
```

The OTP itself is dispatched during `/auth/register` via the shared `sendMobileOtp(...)` helper in `auth-flows.service.ts`, gated by the [SMS dispatch gate](03%20-%20auth%20otp%20flows.md#sms-dispatch-gate): real SMS fires only in production OR when `SMS_FORCE_SEND=true`, otherwise the code is available via `devMobileOtp` in the register response and the application log.

Error table is identical to §2.1a.

---

## 2.1c `POST /api/v1/auth/register/resend-email`

Public. Regenerates the registration email OTP for a user whose initial code has expired or never arrived. Takes only `userId` — the pending OTP row, purpose, channel, and destination are all looked up server-side from the existing `user_otps` row.

> **Why this is public.** Same reason as §2.1a/§2.1b: a freshly-registered user has no JWT because login is gated on both-verified. The resend path needs to be reachable *before* that gate flips.

> **Rate-limiting.** The underlying `udf_otp_resend` enforces a 3-minute wait between resends, a maximum of 3 resends per OTP row, and a 30-minute cooldown once the ceiling is hit. See [03 auth otp flows §3.8](03%20-%20auth%20otp%20flows.md#38-otp-resend-rules) for the authoritative contract.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | int | yes | From the `/auth/register` response. |

**Sample request**

```json
{ "userId": 42 }
```

**Response 200 (development)**

```json
{
  "success": true,
  "message": "Verification email resent",
  "data": {
    "otpId": 7831,
    "devOtp": "194702"
  }
}
```

> In **production** `devOtp` is `null`. `otpId` is always returned — the client should use it as the new `emailOtpId` when calling `/auth/register/verify-email`.

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body shape wrong. |
| 400 | `ALREADY_VERIFIED` | `is_email_verified` is already `true`; nothing to resend. |
| 400 | `NO_EMAIL_ON_FILE` | The user was registered with mobile only. |
| 400 | `OTP_RESEND_FAILED` | Catch-all for unexpected UDF refusal. |
| 404 | `OTP_NOT_FOUND` | No pending registration OTP for this user + channel. The user never started the flow, or the old row has already been consumed/expired out. |
| 429 | `OTP_RESEND_TOO_SOON` | 3-minute wait has not elapsed since the previous send. `details.waitMinutes` tells the client how long to back off. |
| 429 | `OTP_MAX_RESENDS` | Exceeded 3 resends on this OTP row. `details.cooldownMinutes` is `30`. Client should wait out the cooldown and then hit the endpoint again to start a fresh OTP row. |

**Sample `OTP_RESEND_TOO_SOON` response**

```json
{
  "success": false,
  "message": "Cannot resend yet. Please wait 3 minutes.",
  "code": "OTP_RESEND_TOO_SOON",
  "details": { "waitMinutes": 3 }
}
```

---

## 2.1d `POST /api/v1/auth/register/resend-mobile`

Public. Identical shape to §2.1c but for the mobile channel. Dispatches via the shared `sendMobileOtp(...)` helper (SMS dispatch gate applies).

**Sample request**

```json
{ "userId": 42 }
```

**Response 200**

```json
{
  "success": true,
  "message": "Verification SMS resent",
  "data": {
    "otpId": 7832,
    "devOtp": "826341"
  }
}
```

Error table is identical to §2.1c, with `NO_EMAIL_ON_FILE` replaced by `NO_MOBILE_ON_FILE` (the user was registered with email only).

---

## 2.2 `POST /api/v1/auth/login`

Public. Exchanges credentials for a JWT pair.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Either an email or a mobile. The UDF figures out which. |
| `password` | string | yes | 1–128 chars. |

**Sample request**

```json
{
  "identifier": "asha.patel@example.com",
  "password": "Welcome@2026"
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 42,
      "email": "asha.patel@example.com",
      "firstName": "Asha",
      "lastName": "Patel",
      "roles": ["student"],
      "permissions": ["course.read", "lesson.read", "..."]
    },
    "sessionId": 1284,
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "accessExpiresIn": "15m",
    "refreshExpiresIn": "7d"
  }
}
```

> **Where the names come from.** `firstName`, `lastName`, `email`, and the role code are returned by `udf_auth_login` directly on its success payload (it already has the row in hand for the password check), so the Node layer does not need a second round-trip through `udf_get_users` just to render the post-login greeting. The `permissions` array is loaded separately via `udf_auth_get_user_permissions` because effective perms are computed dynamically from role grants. For mobile-identifier logins (where the client posts a phone number instead of an email), the UDF still returns the user's real email here — the JWT's email claim is built from this, not from the submitted identifier.

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/short identifier or password. |
| 401 | `INVALID_CREDENTIALS` | Wrong password or unknown identifier. |
| 403 | `ACCOUNT_NOT_VERIFIED` | User exists and password is correct, but `is_email_verified` and/or `is_mobile_verified` is still `false`. The `details` block carries `{ userId, failureReason, unverifiedChannels }` so the client can route straight to §2.1a / §2.1b. |
| 423 | `ACCOUNT_LOCKED` | Too many failed attempts; wait for the lockout window to elapse. |

**Sample `ACCOUNT_NOT_VERIFIED` response**

```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_NOT_VERIFIED",
    "message": "Email and/or mobile verification required before login",
    "details": {
      "userId": 42,
      "failureReason": "both_not_verified",
      "unverifiedChannels": ["email", "mobile"]
    }
  }
}
```

`failureReason` is one of `email_not_verified` | `mobile_not_verified` | `both_not_verified`. `unverifiedChannels` is the authoritative array the client should iterate to decide which verify routes to hit — if it contains `"email"`, call `/auth/register/verify-email`; if it contains `"mobile"`, call `/auth/register/verify-mobile`.

---

## 2.3 `POST /api/v1/auth/logout`

Authenticated. Revokes the current session: marks the DB session row as logged-out and adds the JWT's `jti` to the Redis blocklist so the access token cannot be replayed.

**Headers**

```
Authorization: Bearer <accessToken>
```

No request body.

**Response 200**

```json
{
  "success": true,
  "message": "Logged out",
  "data": { "revoked": true }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid bearer token. |
| 401 | `INVALID_TOKEN` | Token has no session id (`jti`). |

---

## 2.4 `POST /api/v1/auth/refresh`

Public. Trades a valid refresh token for a fresh access + refresh pair while preserving the original `jti` (so logout still kills the whole chain).

**Request body**

```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "user": { "id": 42, "email": "asha.patel@example.com", "roles": ["student"], "permissions": ["..."] },
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "accessExpiresIn": "15m",
    "refreshExpiresIn": "7d"
  }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `refreshToken` missing or too short. |
| 401 | `INVALID_TOKEN` | Bad signature, expired, or malformed claims. |
| 401 | `TOKEN_REVOKED` | The session this token belongs to was logged out. |

---

## 2.5 `GET /api/v1/auth/me`

Authenticated. Returns the current user's profile, role(s), and effective permission set.

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 42,
    "email": "asha.patel@example.com",
    "mobile": "9662278990",
    "firstName": "Asha",
    "lastName": "Patel",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "roles": ["student"],
    "permissions": ["course.read", "lesson.read", "..."]
  }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/invalid token. |
| 404 | `NOT_FOUND` | Token's `sub` no longer exists (rare — means the user was hard-deleted mid-session). |
