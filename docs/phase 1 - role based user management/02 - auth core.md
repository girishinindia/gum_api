# Phase 1 — Authentication (core)

The bread-and-butter spine: register, log in, refresh, log out, and "who am I". For password resets, contact verification, and email/mobile changes see the next file.

← [01 health](01%20-%20health.md) · **Next →** [03 auth otp flows](03%20-%20auth%20otp%20flows.md)

---

## 2.1 `POST /api/v1/auth/register`

Public. Creates a new account with role `student` or `instructor` and emits OTPs (one to email, one to mobile) so the user can verify both contact channels.

> **Side effect → email.** On success, fires `mailer.sendOtp(..., flow='register')` to the new user's email address. Best-effort: a Brevo failure logs at WARN but does not roll back the registration. See [11 — email notifications](11%20-%20email%20notifications.md).

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
    "devEmailOtp": "493017",
    "devMobileOtp": "820146"
  }
}
```

> In **production** `devEmailOtp` and `devMobileOtp` are `null`. The mobile OTP is dispatched to the E.164 destination `+919662278990` (country `+91` joined with the local number).

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body failed Zod validation (e.g., weak password, neither email nor mobile supplied). |
| 400 | `REGISTRATION_FAILED` | UDF refused (e.g., self-register tried for an admin role). |
| 409 | `DUPLICATE_ENTRY` | Email or mobile already registered. |

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

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/short identifier or password. |
| 401 | `INVALID_CREDENTIALS` | Wrong password or unknown identifier. |
| 401 | `UNAUTHORIZED` | UDF reported the account is unverified or inactive. |
| 423 | `ACCOUNT_LOCKED` | Too many failed attempts; wait for the lockout window to elapse. |

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
