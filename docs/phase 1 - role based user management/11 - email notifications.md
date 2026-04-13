# Phase 1 — Email Notifications

← [10 walkthrough and index](10%20-%20walkthrough%20and%20index.md)

This document describes every transactional email the API can send during Phase 1 RBAC operations: which API endpoints trigger them, which template renders the body, who receives the message, and how delivery failures are handled.

---

## 11.1 Architecture

Email is delivered through a three-layer stack:

```
┌────────────────────────────────────────────────────────────┐
│ business code (auth.service, auth-flows.service,           │
│                users.service, …)                            │
│                                                             │
│   void mailer.sendOtp({ to, name, otp, flow });             │
│   void mailer.sendPasswordChanged({ to, name });            │
│   void mailer.sendRoleChanged({ to, ... });                 │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ mailer.service.ts (orchestrator)                           │
│                                                             │
│   • One method per business event                           │
│   • Composes the right template + subject line              │
│   • Wraps every send in `safeSend()` so failures are        │
│     logged at WARN and never thrown back to the caller      │
│   • Conditionally BCCs admin via EMAIL_ADMIN_NOTIFY         │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ brevoService (transport)                                   │
│                                                             │
│   • Wraps the Brevo HTTP API                                │
│   • Throws AppError(502, EMAIL_SEND_FAILED) on HTTP errors  │
│   • Authenticated with BREVO_API_KEY                        │
└────────────────────────────────────────────────────────────┘
```

The most important rule: **email is best-effort**. Every business operation completes its primary write (create user, change password, etc.) BEFORE the mailer is called, and the mailer call is fired with `void mailer.xxx(...)` so an unhandled rejection is impossible. If Brevo is down or rate-limited, the API request still returns 200 / 201 — only a `WARN` log line tells you the email did not go out.

This means: **the API never returns `502 EMAIL_SEND_FAILED` from Phase 1 endpoints**. That status code is reserved for a future synchronous-mail path that does not exist today.

---

## 11.2 Trigger matrix

| # | Operation                                      | Endpoint                                        | Template                              | Recipient                | BCC admin? | Side-channel? |
|---|------------------------------------------------|-------------------------------------------------|---------------------------------------|--------------------------|------------|---------------|
| 1 | Self registration                              | `POST /api/v1/auth/register`                    | `otp.template` (flow=`register`)      | new user's email         | no         | SMS           |
| 2 | Forgot password — initiate                     | `POST /api/v1/auth/forgot-password`             | `otp.template` (flow=`forgot_password`)| user's email            | no         | SMS           |
| 3 | Forgot password — complete                     | `POST /api/v1/auth/forgot-password/verify`      | `password-changed.template`           | user's email             | no         | —             |
| 4 | Reset password (authenticated) — initiate      | `POST /api/v1/auth/reset-password`              | `otp.template` (flow=`reset_password`)| user's email             | no         | SMS           |
| 5 | Reset password (authenticated) — complete      | `POST /api/v1/auth/reset-password/verify`       | `password-changed.template`           | user's email             | no         | —             |
| 6 | Verify email — initiate                        | `POST /api/v1/auth/verify-email`                | `otp.template` (flow=`verify_email`)  | user's email             | no         | —             |
| 7 | Verify mobile — initiate                       | `POST /api/v1/auth/verify-mobile`               | `otp.template` (flow=`verify_mobile`) | user's email             | no         | SMS           |
| 8 | Change email — initiate                        | `POST /api/v1/auth/change-email`                | `otp.template` (flow=`change_email`)  | NEW email                | no         | —             |
| 9 | Change email — complete                        | `POST /api/v1/auth/change-email/confirm`        | `email-changed.template` (notify-old) | OLD email                | no         | —             |
| 10| Change email — complete (welcome)              | `POST /api/v1/auth/change-email/confirm`        | `email-changed.template` (welcome-new)| NEW email                | no         | —             |
| 11| Change mobile — initiate                       | `POST /api/v1/auth/change-mobile`               | `otp.template` (flow=`change_mobile`) | user's email             | no         | SMS           |
| 12| Change mobile — complete                       | `POST /api/v1/auth/change-mobile/confirm`       | `mobile-changed.template`             | user's email             | no         | —             |
| 13| Admin creates user                             | `POST /api/v1/users`                            | `welcome.template` (admin variant)    | new user's email         | no         | —             |
| 14| Admin soft-deletes user                        | `DELETE /api/v1/users/:id`                      | `account-deleted.template`            | target user's email      | **yes**    | —             |
| 15| Admin restores user                            | `POST /api/v1/users/:id/restore`                | `account-restored.template`           | target user's email      | no         | —             |
| 16| Admin deactivates user                         | `POST /api/v1/users/:id/deactivate`             | `account-deactivated.template`        | target user's email      | no         | —             |
| 17| Admin changes user role                        | `POST /api/v1/users/:id/change-role`            | `role-changed.template`               | target user's email      | no         | —             |

Operations that intentionally do **not** send email today (and why):

- `POST /api/v1/users/:id/set-verification` — admins can force-verify a user's email/mobile flag without dispatching a notification, since the user did not initiate the verification themselves. Adding this notification later is a one-line change in `users.service.setUserVerification`.
- `POST /api/v1/users/:id` (PATCH update) — profile field updates are noisy; we don't want to email on every name change. If this becomes important, add a per-field notify list.
- All RBAC junction operations (`role-permissions/*`, `user-permissions/*`) — admin-only audit events; the affected user typically does not need a per-grant email. The aggregate change is communicated via the role-changed email (#17 above) when the role itself is replaced.

---

## 11.3 Templates

Templates live in `api/src/integrations/email/templates/`. Each is a pure function that takes typed inputs and returns an HTML string built on `base-layout.template.ts` (the shared Brand-coloured wrapper).

| File                                  | Exports                                                              |
|---------------------------------------|----------------------------------------------------------------------|
| `base-layout.template.ts`             | `baseLayout`, `otpBlock`, `infoBox`, `warningBox`, `successBox`, `paragraph` |
| `otp.template.ts`                     | `OtpFlow` (type), `otpTemplate`, `otpSubject`                        |
| `welcome.template.ts`                 | `welcomeTemplate`, `welcomeAdminCreatedTemplate`                     |
| `password-changed.template.ts`        | `passwordChangedTemplate`                                            |
| `email-changed.template.ts`           | `emailChangedNotifyTemplate`, `emailChangedWelcomeTemplate`          |
| `mobile-changed.template.ts`          | `mobileChangedTemplate`                                              |
| `account-deactivated.template.ts`     | `accountDeactivatedTemplate`                                         |
| `account-deleted.template.ts`         | `accountDeletedTemplate`                                             |
| `account-restored.template.ts`        | `accountRestoredTemplate`                                            |
| `role-changed.template.ts`            | `roleChangedTemplate`                                                |

The `OtpFlow` union covers all 8 OTP-driven flows: `register | forgot_password | reset_password | change_password | verify_email | verify_mobile | change_email | change_mobile`.

---

## 11.4 Mailer service surface

`api/src/integrations/email/mailer.service.ts` exposes one named method per business event. Every method is `Promise<void>`, returns `void` even on Brevo failures, and is safe to call with `void mailer.xxx(...)`.

```ts
import { mailer } from '../../integrations/email/mailer.service';

// OTP — used by every initiate flow
void mailer.sendOtp({
  to: 'asha@example.com',
  name: 'Asha',
  otp: '493017',
  flow: 'register'
});

// Account lifecycle
void mailer.sendWelcome({ to, name });
void mailer.sendWelcomeAdminCreated({ to, name, loginUrl, setPasswordUrl, createdByName });
void mailer.sendPasswordChanged({ to, name });
void mailer.sendEmailChangedNotifyOld({ oldEmail, name, newEmail });
void mailer.sendEmailChangedWelcomeNew({ newEmail, name });
void mailer.sendMobileChanged({ to, name, newMobile });
void mailer.sendAccountDeactivated({ to, name });
void mailer.sendAccountDeleted({ to, name });   // BCCs admin if EMAIL_ADMIN_NOTIFY is set
void mailer.sendAccountRestored({ to, name });
void mailer.sendRoleChanged({ to, name, oldRoleName, newRoleName, changedByName });
```

The internal `safeSend` wrapper logs the dispatch outcome:

- success → `logger.debug({ label, to }, '[mailer] dispatched')`
- failure → `logger.warn({ err, label, to }, '[mailer] delivery failed; primary operation already succeeded')`

If you don't see a `[mailer]` log line for an operation that should have triggered email, check that the user has an `email` value on file — every method short-circuits silently when `to` is missing.

---

## 11.5 Environment variables

The following env vars must be set for email delivery to work in any environment. They are validated at boot via `api/src/config/env.ts`:

| Variable                | Purpose                                                                                  |
|-------------------------|------------------------------------------------------------------------------------------|
| `BREVO_API_KEY`         | API key for the Brevo transactional email service                                        |
| `EMAIL_FROM`            | Sender address (e.g. `info@growupmore.com`)                                              |
| `EMAIL_FROM_NAME`       | Sender display name (e.g. `Grow Up More`)                                                |
| `EMAIL_ADMIN`           | Admin email address (used for system audit purposes)                                     |
| `EMAIL_ADMIN_NOTIFY`    | BCC target for admin notifications (welcome, account-deleted). Can equal `EMAIL_ADMIN`.  |
| `APP_URL`               | Base URL of the API; used to construct `loginUrl` / `setPasswordUrl` for admin-create    |

If `EMAIL_ADMIN_NOTIFY` is not set, the admin BCC is silently skipped (the user-facing email still goes out).

---

## 11.6 Local development & the dev OTP echo

In any non-production environment (`NODE_ENV !== 'production'`), every initiate endpoint **also** returns the raw OTP code in its HTTP response payload as `devEmailOtp` / `devMobileOtp` / `devOtpCode`. This is intentional: it lets the `verify:auth-flows` harness drive end-to-end tests without a real mail/SMS gateway.

The mailer dispatch happens in addition to the dev echo, not in place of it. You can therefore:

1. Develop locally without ever configuring `BREVO_API_KEY` (the mailer will warn-log on every failed send but the API will still work).
2. Or wire a real Brevo sandbox key in `.env.local` and watch the emails arrive in your inbox while the harness simultaneously reads the dev OTP from the response.

In production (`NODE_ENV === 'production'`), the dev OTP fields are hardcoded to `null` and never leak. Email is the only delivery channel.

---

## 11.7 Failure semantics — what you'll see when things break

| Scenario                                          | API response       | Log line                                                              |
|---------------------------------------------------|--------------------|-----------------------------------------------------------------------|
| Brevo returns 401 (bad API key)                   | unchanged (200/201)| `WARN [mailer] delivery failed; primary operation already succeeded`  |
| Brevo returns 429 (rate-limited)                  | unchanged (200/201)| `WARN [mailer] delivery failed; primary operation already succeeded`  |
| Brevo timeout / network error                     | unchanged (200/201)| `WARN [mailer] delivery failed; primary operation already succeeded`  |
| Brevo accepts the request but the message bounces | unchanged (200/201)| no extra log; the bounce shows up in Brevo's dashboard, not our logs  |
| User has no `email` on file                       | unchanged (200/201)| no log; the mailer call is skipped at the call site                   |
| `BREVO_API_KEY` not set                           | **boot error**     | `Error: BREVO_API_KEY: required` from `env.ts` zod validation         |

The point is that **your auth/users endpoints stay green even when email is broken**. If your inbox is empty after a registration, check the API logs for `[mailer]` lines before assuming the API itself is broken.

---

## 11.8 How to add a new email notification

1. Create a new template file under `api/src/integrations/email/templates/<thing>.template.ts` that returns an HTML string built on `base-layout.template.ts`.
2. Add a new method to `mailer.service.ts`:
   ```ts
   async sendThing(input: { to: string; name: string; ... }): Promise<void> {
     return safeSend('thing', input.to, () =>
       brevoService.sendToOne({
         to: input.to,
         toName: input.name,
         subject: 'Your subject line here',
         html: thingTemplate({ name: input.name, ... })
       })
     );
   }
   ```
3. Call it from the relevant service method using `void mailer.sendThing({ ... });` immediately after the primary write completes.
4. Add a row to the trigger matrix in §11.2.

That's it — no global registration step, no new dependency injection wiring. The `mailer` singleton is imported wherever it's needed.
