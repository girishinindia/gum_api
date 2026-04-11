# Phase 1 — Authentication (OTP flows)

Six self-service flows that all share a common shape: an **initiate** call generates an OTP (or two — "dual channel" flows produce one for email and one for mobile) and a **complete** call submits the codes the user typed in.

> **Tip:** In dev/test all initiate responses include the OTP code(s) so you can copy-paste them into the complete request immediately.

← [02 auth core](02%20-%20auth%20core.md) · **Next →** [04 users](04%20-%20users.md)

---

## SMS dispatch gate

Every flow below that sends a mobile OTP ultimately calls the shared `sendMobileOtp(...)` helper in `auth-flows.service.ts`. The helper re-reads the OTP's destination out of `user_otps` (already formatted to E.164 by the initiate UDFs using `countries.phone_code`), strips the leading `+`, and calls `smsGatewayService.sendOtp({ phone, name, otp })` which wraps the SMSGatewayHub `SendSMS` endpoint with the DLT-compliant template baked in.

The helper's dispatch gate is:

```
if (env.NODE_ENV !== 'production' && !env.SMS_FORCE_SEND) return;
```

In plain English: real SMS only fires when the node is in production mode **or** when the `SMS_FORCE_SEND` env flag is `true`. With both unset (the default for local dev), the helper is a no-op and the flow relies on the dev OTP echo channel — every initiate response carries a `devMobileOtp` field in non-production and the OTP also lands in the application logger at `info` level. This is what keeps the `verify-auth-flows` harness working without burning SMSGatewayHub credits.

| Env | `NODE_ENV` | `SMS_FORCE_SEND` | Real SMS fires? | `devMobileOtp` in response? |
|---|---|---|---|---|
| Local dev (default) | `development` | `false` | No | Yes |
| Local dev (forced) | `development` | `true` | Yes | Yes |
| CI / test | `test` | `false` | No | Yes |
| Production | `production` | any | Yes | No |

Failures from the gateway are logged at `warn`/`error` but never surfaced to the caller — the OTP row is still verifiable from the DB and the client can retry. This matches the email dispatch contract from [11 — email notifications](11%20-%20email%20notifications.md): delivery is fire-and-forget, never transactional.

---

## 3.1 Forgot password — public, dual-channel

### `POST /api/v1/auth/forgot-password`

Public. Sends OTPs to **both** the user's email and mobile so they can prove ownership of the account before resetting their password.

> **Side effect → email.** Initiate fires `mailer.sendOtp(..., flow='forgot_password')` to the user's email; `forgot-password/verify` (the complete leg) additionally fires `mailer.sendPasswordChanged(...)` after success. See [11 — email notifications](11%20-%20email%20notifications.md).

**Request body**

```json
{
  "email": "asha.patel@example.com",
  "mobile": "9662278990"
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Verification codes sent",
  "data": {
    "userId": 42,
    "emailOtpId": 7821,
    "mobileOtpId": 7822,
    "devEmailOtp": "402915",
    "devMobileOtp": "118730"
  }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Email or mobile malformed. |
| 404 | `NOT_FOUND` | No user matches both the supplied email and mobile. |

### `POST /api/v1/auth/forgot-password/verify`

Public. Submits both OTPs and the new password.

**Request body**

```json
{
  "userId": 42,
  "emailOtpId": 7821,
  "emailOtpCode": "402915",
  "mobileOtpId": 7822,
  "mobileOtpCode": "118730",
  "newPassword": "BrandNew@2026"
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Password has been reset",
  "data": { "userId": 42 }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | OTP not 4–8 digits, password too weak, etc. |
| 400 | `OTP_INVALID` | OTP wrong or expired. |
| 404 | `NOT_FOUND` | OTP id or user id doesn't exist. |

---

## 3.2 Reset password — authenticated, dual-channel

> **Side effect → email.** Initiate fires `mailer.sendOtp(..., flow='reset_password')` to the current user's email; `reset-password/verify` additionally fires `mailer.sendPasswordChanged(...)` after success. See [11 — email notifications](11%20-%20email%20notifications.md).


For logged-in users who want to change their password and prove control of both contacts.

### `POST /api/v1/auth/reset-password`

Authenticated. No request body — `userId` is taken from the JWT. Sends one OTP to the user's email and one to their mobile.

**Response 200**

```json
{
  "success": true,
  "message": "Verification codes sent",
  "data": {
    "userId": 42,
    "emailOtpId": 7901,
    "mobileOtpId": 7902,
    "devEmailOtp": "550012",
    "devMobileOtp": "337841"
  }
}
```

### `POST /api/v1/auth/reset-password/verify`

Authenticated.

**Request body**

```json
{
  "emailOtpId": 7901,
  "emailOtpCode": "550012",
  "mobileOtpId": 7902,
  "mobileOtpCode": "337841",
  "newPassword": "AnotherOne@2026"
}
```

**Response 200**

```json
{
  "success": true,
  "message": "Password has been changed",
  "data": { "userId": 42 }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` / `OTP_INVALID` | Bad shape or wrong/expired OTP. |
| 401 | `UNAUTHORIZED` | Missing token. |

---

## 3.3 Verify email — authenticated, single-channel

> **Side effect → email.** Initiate fires `mailer.sendOtp(..., flow='verify_email')` to the current user's email. The verify leg sends nothing (the verification itself is the user-visible result). See [11 — email notifications](11%20-%20email%20notifications.md).


### `POST /api/v1/auth/verify-email`

Authenticated. No body. Sends a fresh OTP to the user's current email address (used when `is_email_verified` is still `false`, or after a profile update).

**Response 200**

```json
{
  "success": true,
  "message": "Verification email sent",
  "data": { "otpId": 8001, "devEmailOtp": "994201" }
}
```

### `POST /api/v1/auth/verify-email/confirm`

Authenticated.

**Request body**

```json
{ "otpId": 8001, "otpCode": "994201" }
```

**Response 200**

```json
{
  "success": true,
  "message": "Email verified",
  "data": { "userId": 42, "isEmailVerified": true }
}
```

---

## 3.4 Verify mobile — authenticated, single-channel

> **Side effect → email + SMS.** Initiate fires `mailer.sendOtp(..., flow='verify_mobile')` to the user's email AND dispatches the SMS via the shared `sendMobileOtp(...)` helper. SMS dispatch is gated by `NODE_ENV === 'production'` OR `SMS_FORCE_SEND === true` — see [SMS dispatch gate](#sms-dispatch-gate). See also [11 — email notifications](11%20-%20email%20notifications.md).


Same shape as 3.3 but for the mobile channel. Endpoints:

- `POST /api/v1/auth/verify-mobile`           — initiate (no body)
- `POST /api/v1/auth/verify-mobile/confirm`   — `{ otpId, otpCode }`

**Confirm response 200**

```json
{
  "success": true,
  "message": "Mobile verified",
  "data": { "userId": 42, "isMobileVerified": true }
}
```

When the [SMS dispatch gate](#sms-dispatch-gate) is open, the OTP is dispatched to the user's mobile in fully qualified E.164 form (e.g., `+919662278990`), built from the user's `country_id → countries.phone_code` joined with `users.mobile`.

---

## 3.5 Change email — authenticated

> **Side effect → email.** Initiate fires `mailer.sendOtp(..., flow='change_email')` to the **NEW** email (proves ownership). The `change-email/confirm` complete leg fires TWO emails: `sendEmailChangedNotifyOld(...)` to the OLD address (security audit) AND `sendEmailChangedWelcomeNew(...)` to the NEW address. See [11 — email notifications](11%20-%20email%20notifications.md).


### `POST /api/v1/auth/change-email`

Authenticated. Sends an OTP to the **new** email address. The current address is untouched until `confirm` succeeds.

**Request body**

```json
{ "newEmail": "asha.new@example.com" }
```

**Response 200**

```json
{
  "success": true,
  "message": "Verification code sent to new email",
  "data": {
    "requestId": 5501,
    "otpId": 8101,
    "devEmailOtp": "271830"
  }
}
```

### `POST /api/v1/auth/change-email/confirm`

Authenticated. Commits the change and forces a re-login (so existing tokens stop carrying the old email claim).

**Request body**

```json
{ "requestId": 5501, "otpId": 8101, "otpCode": "271830" }
```

**Response 200**

```json
{
  "success": true,
  "message": "Email changed; please re-login",
  "data": { "userId": 42, "newEmail": "asha.new@example.com" }
}
```

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad email shape or OTP shape. |
| 400 | `OTP_INVALID` | Wrong or expired OTP. |
| 409 | `DUPLICATE_ENTRY` | The new email already belongs to another user. |

---

## 3.6 Change mobile — authenticated

> **Side effect → email + SMS.** Initiate fires `mailer.sendOtp(..., flow='change_mobile')` to the user's **email** (a trusted side-channel for confirming a mobile swap) AND dispatches the SMS to the new number via the shared `sendMobileOtp(...)` helper — gated by the [SMS dispatch gate](#sms-dispatch-gate). The `change-mobile/confirm` complete leg fires `mailer.sendMobileChanged(...)` to the user's email after success. See [11 — email notifications](11%20-%20email%20notifications.md).


Same shape as 3.5 but for the mobile channel.

- `POST /api/v1/auth/change-mobile` — body `{ "newMobile": "9123456789" }`
- `POST /api/v1/auth/change-mobile/confirm` — body `{ requestId, otpId, otpCode }`

When the [SMS dispatch gate](#sms-dispatch-gate) is open, the OTP is dispatched to the new mobile in E.164 form (using the user's country code).
