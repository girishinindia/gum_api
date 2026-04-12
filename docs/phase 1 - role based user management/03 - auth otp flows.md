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

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1a](#31a) | `POST` | `{{baseUrl}}/api/v1/auth/forgot-password` | public | Start forgot-password flow — sends OTP to email/mobile. |
| [§3.1b](#31b) | `POST` | `{{baseUrl}}/api/v1/auth/forgot-password/verify` | public | Verify forgot-password OTP → returns reset `requestId`. |
| [§3.2a](#32a) | `POST` | `{{baseUrl}}/api/v1/auth/reset-password` | public | Submit new password using reset `requestId`. |
| [§3.2b](#32b) | `POST` | `{{baseUrl}}/api/v1/auth/reset-password/verify` | public | Validate reset requestId + OTP prior to final reset. |
| [§3.3a](#33a) | `POST` | `{{baseUrl}}/api/v1/auth/verify-email` | Bearer | Initiate email verification — sends OTP to primary email. |
| [§3.3b](#33b) | `POST` | `{{baseUrl}}/api/v1/auth/verify-email/confirm` | Bearer | Confirm email verification with `{otpId, otpCode}`. |
| [§3.3c](#33c) | `POST` | `{{baseUrl}}/api/v1/auth/verify-email/resend` | Bearer | Regenerate a fresh email verification OTP. |
| [§3.4a](#34a) | `POST` | `{{baseUrl}}/api/v1/auth/verify-mobile` | Bearer | Initiate mobile verification — sends OTP via SMS. |
| [§3.4b](#34b) | `POST` | `{{baseUrl}}/api/v1/auth/verify-mobile/confirm` | Bearer | Confirm mobile verification with `{otpId, otpCode}`. |
| [§3.4c](#34c) | `POST` | `{{baseUrl}}/api/v1/auth/verify-mobile/resend` | Bearer | Regenerate a fresh mobile verification OTP. |
| [§3.5a](#35a) | `POST` | `{{baseUrl}}/api/v1/auth/change-email` | Bearer | Request change of primary email — sends OTP to new address. |
| [§3.5b](#35b) | `POST` | `{{baseUrl}}/api/v1/auth/change-email/confirm` | Bearer | Confirm change-email with `{requestId, otpId, otpCode}`. |
| [§3.6a](#36a) | `POST` | `{{baseUrl}}/api/v1/auth/change-mobile` | Bearer | Request change of primary mobile — sends OTP to new number. |
| [§3.6b](#36b) | `POST` | `{{baseUrl}}/api/v1/auth/change-mobile/confirm` | Bearer | Confirm change-mobile with `{requestId, otpId, otpCode}`. |

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

### `POST /api/v1/auth/verify-email/resend`

Authenticated. No body — `userId` is pulled from the JWT. Regenerates the re-verification email OTP when the user's previous code expired or never arrived. Uses the same `udf_otp_resend` rules documented in [§3.8](#38-otp-resend-rules): 3-minute wait between sends, max 3 resends, 30-minute cooldown once the ceiling is hit.

**Response 200**

```json
{
  "success": true,
  "message": "Verification email resent",
  "data": {
    "otpId": 8011,
    "devOtp": "583019"
  }
}
```

> In **production** `devOtp` is `null`. The returned `otpId` supersedes the previous one — clients must use it for the next `/verify-email/confirm` call.

**Errors**

| HTTP | code | Cause |
|---|---|---|
| 400 | `NO_EMAIL_ON_FILE` | User record has no email (shouldn't happen for a logged-in user that reached this flow). |
| 400 | `OTP_RESEND_FAILED` | Catch-all for unexpected UDF refusal. |
| 401 | `UNAUTHORIZED` | Missing/invalid token. |
| 404 | `OTP_NOT_FOUND` | No pending re-verification OTP for this user + channel. Start the flow with `POST /verify-email` first. |
| 429 | `OTP_RESEND_TOO_SOON` | 3-minute wait has not elapsed. `details.waitMinutes` carries the remaining wait. |
| 429 | `OTP_MAX_RESENDS` | Exceeded 3 resends; `details.cooldownMinutes` is `30`. |

---

## 3.4 Verify mobile — authenticated, single-channel

> **Side effect → email + SMS.** Initiate fires `mailer.sendOtp(..., flow='verify_mobile')` to the user's email AND dispatches the SMS via the shared `sendMobileOtp(...)` helper. SMS dispatch is gated by `NODE_ENV === 'production'` OR `SMS_FORCE_SEND === true` — see [SMS dispatch gate](#sms-dispatch-gate). See also [11 — email notifications](11%20-%20email%20notifications.md).


Same shape as 3.3 but for the mobile channel. Endpoints:

- `POST /api/v1/auth/verify-mobile`           — initiate (no body)
- `POST /api/v1/auth/verify-mobile/confirm`   — `{ otpId, otpCode }`
- `POST /api/v1/auth/verify-mobile/resend`    — regen OTP (no body); same contract as §3.3 resend, same error table with `NO_EMAIL_ON_FILE` replaced by `NO_MOBILE_ON_FILE`

**Confirm response 200**

```json
{
  "success": true,
  "message": "Mobile verified",
  "data": { "userId": 42, "isMobileVerified": true }
}
```

**Resend response 200**

```json
{
  "success": true,
  "message": "Verification SMS resent",
  "data": { "otpId": 8022, "devOtp": "711205" }
}
```

When the [SMS dispatch gate](#sms-dispatch-gate) is open, the OTP is dispatched to the user's mobile in fully qualified E.164 form (e.g., `+919662278990`), built from the user's `country_id → countries.phone_code` joined with `users.mobile`. The resend route uses the same helper and the same gate.

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

---

## 3.8 OTP resend rules

All resend routes — both the public `/auth/register/resend-email` + `/auth/register/resend-mobile` ([02 §2.1c / §2.1d](02%20-%20auth%20core.md#21c-post-apiv1authregisterresend-email)) and the authenticated `/auth/verify-email/resend` + `/auth/verify-mobile/resend` (§3.3 / §3.4 above) — route through the `udf_otp_resend(p_user_id, p_purpose, p_channel, p_destination)` function defined in `phase-01-role-based-user-management/07-user-otps/06_fn_resend.sql`.

The contract that function enforces (and that the Node layer translates into HTTP error codes):

| Rule | Behaviour | Surfaced as |
|---|---|---|
| Must be at least 3 minutes since the previous send on this OTP row | `udf_otp_resend` refuses with `"Cannot resend yet. Please wait N minute(s)."` | `429 OTP_RESEND_TOO_SOON` with `details.waitMinutes` |
| Maximum 3 resends per OTP row | Once `resend_count` reaches 3, the row is marked exhausted for 30 minutes before it can be recycled | `429 OTP_MAX_RESENDS` with `details.cooldownMinutes: 30` |
| A pending OTP row must exist | If no `purpose + channel` OTP row in `pending` state is found for this user | `404 OTP_NOT_FOUND` for `forgot_password` / `reset_password` / `change_*` flows; the four register-time and re-verify resend routes silently recover via the fallback below |
| Happy path | Old OTP is invalidated; a new 6-digit code is generated; `resend_count` is incremented; destination is re-dispatched via the same mailer/SMS pipeline as the original initiate | `200` with `{ otpId, devOtp }` |

### Resend recovery from expired rows

`udf_otp_resend` only matches rows where `status = 'pending'`. After a code expires (10 minutes after generation), or after an unrelated flow flips the row to `invalidated` / `verified`, that filter no longer finds anything and the UDF returns `"No pending OTP found for this user, purpose, and channel"`. Without recovery, the user is permanently blocked from restarting verification through the resend endpoint — the only way out would be a fresh `register` call, which would conflict on the existing email/mobile.

The Node service layer therefore opts the four register-time and re-verify resend routes into a `fallbackToGenerate: true` flag on `callOtpResend`. When the resend UDF reports `OTP_NOT_FOUND` *and* the caller has opted in, `auth-flows.service.ts` transparently calls `udf_otp_generate(userId, purpose, channel, destination)` instead and returns the freshly-issued row in the same `{ otpId, otpCode }` shape. The surrounding wrapper then dispatches via the same mailer/SMS pipeline it would have used on a normal resend, so the client sees an indistinguishable `200 { otpId, devOtp }` response.

The fallback is **opt-in** so it doesn't bleed into the `forgot-password` / `reset-password` / `change-*` flows. Those flows have a fresh `*_initiate` step that the user can re-run; conflating "resend" and "regenerate" there would mask flow-state bugs and undermine the cooldown contract. Register-time and re-verify resends are different because they have no comparable "re-initiate" affordance — the original initiate happened during account creation (or an earlier verify-leg call) and can't be repeated.

The fallback is also bounded by the same enumeration guards already in `registerResend`/`reVerifyResend` — if the channel is already verified or the user has no contact on file, the wrapper rejects with `ALREADY_VERIFIED` / `NO_EMAIL_ON_FILE` / `NO_MOBILE_ON_FILE` *before* `callOtpResend` runs, so the regenerate path can never be used to spin up OTPs against a contact the user never supplied.

When the fallback fires it logs at `info` level with `{ userId, purpose, channel }` so this code path is observable in production:

```
[auth-flows] resend found no pending row; falling back to udf_otp_generate
```

**Dispatch matrix** (once the resend DB call succeeds):

| Flow | Email dispatch | SMS dispatch |
|---|---|---|
| `/auth/register/resend-email` | `mailer.sendOtp(flow='register')` | — |
| `/auth/register/resend-mobile` | — | `sendMobileOtp(...)` via [SMS dispatch gate](#sms-dispatch-gate) |
| `/auth/verify-email/resend` | `mailer.sendOtp(flow='verify_email')` | — |
| `/auth/verify-mobile/resend` | — | `sendMobileOtp(...)` via [SMS dispatch gate](#sms-dispatch-gate) |

All dispatches are fire-and-forget: a failing mailer or SMS gateway is logged at `warn`/`error` but never rolls back the resend — the new OTP row is already committed and the user can retry the verify leg with the `otpId` returned in the resend response.

> **Why only these four flows.** The `forgot-password`, `reset-password`, `change-email`, and `change-mobile` flows already terminate in a *complete* call shortly after *initiate*; if the user times out, they just re-run the full initiate which generates a fresh OTP row from scratch. The register-time and re-verify flows are different because the `initiate` step is coupled to a state transition (`register` creates the user; the re-verify initiate was already burned) that we don't want to re-run just to re-dispatch a code.

---

## Things the UDF layer exposes that the HTTP layer doesn't (yet)

Scanned the `12-auth` UDF directory and the `07-user-otps` / `11-sessions` helpers to catch anything that has a working database contract but no Node wrapper. As of this commit:

- **`udf_auth_logout_all(p_user_id)`** — revokes every active session for a user (handy for "log out everywhere" in a profile/security screen). Not yet wired. When we ship it, it should live as `POST /auth/logout-all`, authenticated, no body, and also push every session's `jti` onto the Redis blocklist so the access tokens are invalidated in flight (not just the DB session rows).

Everything else in the `12-auth` directory (register, login, logout, refresh, me, forgot password, reset password, verify email, verify mobile, change email, change mobile, now plus the four resend wrappers documented above) has a Node route. If we add another UDF, update this list at the same time.
