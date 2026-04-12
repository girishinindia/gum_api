# Phase 1 — Overview & Conventions

A complete, plain-English reference for every HTTP endpoint exposed by the GrowUpMore Enterprise E-Learning Platform API in Phase 1 (Role-Based User Management). This document is split into one file per resource so you can scan only the part you need.

> **Base URL** — `http://localhost:3000` in development. All endpoints live under `/api/v1`.
>
> **Auth** — Most endpoints require a Bearer JWT obtained from `POST /api/v1/auth/login`.
> Send it as `Authorization: Bearer <accessToken>`.
>
> **Content type** — All request and response bodies are `application/json`.

---

## Reading order

| # | File | Contents |
|---|---|---|
| 00 | **overview** *(this file)* | Conventions, envelopes, error catalog. |
| 01 | [health](01%20-%20health.md) | Liveness and readiness probes. |
| 02 | [auth core](02%20-%20auth%20core.md) | Register, login, logout, refresh, me. |
| 03 | [auth otp flows](03%20-%20auth%20otp%20flows.md) | Forgot / reset password, verify and change email/mobile. |
| 04 | [users](04%20-%20users.md) | User CRUD plus admin operations. |
| 05 | [countries](05%20-%20countries.md) | Reference data CRUD. |
| 06 | [roles](06%20-%20roles.md) | RBAC role catalog CRUD. |
| 07 | [permissions](07%20-%20permissions.md) | RBAC permission catalog CRUD. |
| 08 | [role-permissions](08%20-%20role-permissions.md) | Bind permissions to roles. |
| 09 | [user-permissions](09%20-%20user-permissions.md) | User-level grant / deny overrides. |
| 10 | [walkthrough and index](10%20-%20walkthrough%20and%20index.md) | End-to-end happy path + flat endpoint index. |

---

## 1. Common conventions

**Pagination.** Any `GET /` list endpoint accepts the same two query parameters:

| Param | Type | Default | Range | Meaning |
|---|---|---|---|---|
| `pageIndex` | int | `1` | `≥ 1` | Page number, **1-indexed**. |
| `pageSize`  | int | `20` | `1 – 100` | Rows per page. |

Most list endpoints additionally accept `searchTerm`, `sortColumn`, and `sortDirection` (`ASC`/`DESC`). The set of valid `sortColumn` values is whitelisted per resource and listed inside that resource's section.

**Soft delete.** Almost every resource is soft-deleted: `DELETE /:id` flips `is_deleted=TRUE`, and `POST /:id/restore` reverses it. Hard deletes are reserved for special admin operations.

**Hierarchy guard.** User-targeting operations (`DELETE /users/:id`, `POST /users/:id/change-role`, etc.) are enforced at the database layer: you can never act on a user whose role outranks (or equals) yours.

**OTP behaviour.** In **dev / test** the API echoes the OTP code on the response (`devEmailOtp`, `devMobileOtp`, etc.) so the verification harness and local clients can complete the second leg without an inbox. In **production** these fields are `null` and the code is delivered out-of-band (Brevo for email, SMSGatewayHub for SMS — destinations are E.164-formatted, e.g. `+919662278990`).

---

## 2. Standard envelopes

Every successful 2xx response uses one of two shapes.

**Single-resource success**

```json
{
  "success": true,
  "message": "OK",
  "data": { "...the resource..." }
}
```

**Paginated list success**

```json
{
  "success": true,
  "message": "OK",
  "data": [ { "...row..." }, { "...row..." } ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalCount": 137,
    "totalPages": 7
  }
}
```

**Error envelope**

```json
{
  "success": false,
  "message": "Human-readable explanation",
  "code": "VALIDATION_ERROR",
  "details": "Optional. Extra context — for VALIDATION_ERROR this is an array of issues."
}
```

---

## 3. Error catalog

Every endpoint can return any of these. The endpoint sections in the per-resource files only list the **business-specific** errors on top of this catalog.

| HTTP | `code` | Triggered when |
|---|---|---|
| **400** | `VALIDATION_ERROR` | Request body / query / params failed Zod validation. `details` is an array of `{path, message, code}` issues. |
| **400** | `BAD_REQUEST` | Generic client mistake the UDF rejected. |
| **401** | `UNAUTHORIZED` | Missing, malformed, or expired access token. |
| **401** | `INVALID_CREDENTIALS` | Wrong password / unknown identifier on login. |
| **401** | `INVALID_TOKEN` | JWT signature or claims malformed. |
| **401** | `TOKEN_REVOKED` | Refresh attempted with a token whose session has been logged out. |
| **403** | `FORBIDDEN` | Authenticated user lacks the required permission code or hierarchy rank. |
| **403** | `ACCOUNT_INACTIVE` | User has no active role or `is_active = false`. |
| **404** | `NOT_FOUND` | Resource (or route) doesn't exist. |
| **409** | `CONFLICT` | Generic uniqueness or state conflict. |
| **409** | `DUPLICATE_ENTRY` | Email / mobile / code already exists. |
| **423** | `ACCOUNT_LOCKED` | Too many failed login attempts. |
| **500** | `INTERNAL_ERROR` | Unhandled bug or upstream failure (DB, Redis). |
| **502** | `BUNNY_UPLOAD_FAILED` | File-upload routes only — Bunny CDN Storage rejected the PUT (network or auth error against the CDN). |
| **502** | `EMAIL_SEND_FAILED` | Reserved — defined in `brevo.service.ts` for a future synchronous-mail path. **Phase 1 endpoints never return this code today** because all transactional email is dispatched fire-and-forget through `mailer.service.ts` and failures are logged at WARN, not surfaced to the API response. See [11 — email notifications](11%20-%20email%20notifications.md). |
| **503** | (n/a) | `/health/ready` only — one or more dependencies down. |

---

## 7. Postman environment

Every endpoint in this phase is documented as a Postman request using two **environment variables** — set them once on your Postman environment and every request in the collection will resolve them automatically:

| Variable | Example value | Where it is used |
|---|---|---|
| `baseUrl` | `http://localhost:3000` (local) · `https://api.growupmore.com` (prod) | Every request URL is written as `{{baseUrl}}/api/v1/...`. |
| `accessToken` | a Super Admin JWT, minted once per session via `POST {{baseUrl}}/api/v1/auth/login` | Every authenticated request sends `Authorization: Bearer {{accessToken}}`. |

**Minting an access token** — run this request once and copy `data.accessToken` from the response into the `accessToken` environment variable:

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/auth/login` |
| Headers | `Content-Type: application/json` |
| Body | `{ "identifier": "superadmin@growupmore.com", "password": "<password>" }` |

A machine-readable Postman v2.1 collection is also available at `api/docs/postman/phase-1.postman_collection.json` — import it and the folder tree will mirror the files in this folder (Health / Auth Core / Auth OTP Flows / Users / Countries / Roles / Permissions / Role-permissions / User-permissions / Email notifications), each request pre-populated with headers, body, and example responses.

---

**Next →** [01 — health](01%20-%20health.md)
