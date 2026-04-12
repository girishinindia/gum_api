# Phase 4 — User Social Medias

`user_social_medias` is a **1:M child of `users`** mapping each user to the social / professional / code / messaging platforms they want to expose on their profile. The row references `social_medias` (the phase-02 master-data lookup) via a NOT NULL FK, so every row is always pinned to a known platform. A unique `(user_id, social_media_id)` constraint means a user can have at most one link per platform.

Same **soft-delete + admin restore** model as `user_education` / `user_experience`, same `/me` + `/:id` split. If you've read [§2](02%20-%20user-education.md) or [§3](03%20-%20user-experience.md) you already know the shape of this module.

All routes require auth. Permission codes use the **singular** resource name `user_social_media`: `user_social_media.create`, `user_social_media.read`, `user_social_media.read.own`, `user_social_media.update`, `user_social_media.update.own`, `user_social_media.delete`, `user_social_media.delete.own`, `user_social_media.restore`.

> The table name is plural (`user_social_medias`) but the permission resource is singular (`user_social_media`). The API path mirrors the table name: `/api/v1/user-social-medias`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [03 user-experience](03%20-%20user-experience.md) · **Next →** [05 user-skills](05%20-%20user-skills.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§4.1](#41-get-apiv1user-social-medias) | `GET` | `{{baseUrl}}/api/v1/user-social-medias` | `user_social_media.read` | List all social-media rows (admin+). |
| [§4.2](#42-get-apiv1user-social-mediasme) | `GET` | `{{baseUrl}}/api/v1/user-social-medias/me` | `user_social_media.read.own` | List caller's own social-media rows. |
| [§4.3](#43-post-apiv1user-social-mediasme) | `POST` | `{{baseUrl}}/api/v1/user-social-medias/me` | `user_social_media.update.own` | Self-service create — `userId` derived from token. |
| [§4.4](#44-patch-apiv1user-social-mediasmeid) | `PATCH` | `{{baseUrl}}/api/v1/user-social-medias/me/:id` | `user_social_media.update.own` (self match enforced) | Self-service partial update. |
| [§4.5](#45-delete-apiv1user-social-mediasmeid) | `DELETE` | `{{baseUrl}}/api/v1/user-social-medias/me/:id` | `user_social_media.delete.own` (self match enforced) | Self-service soft-delete. |
| [§4.6](#46-get-apiv1user-social-mediasid) | `GET` | `{{baseUrl}}/api/v1/user-social-medias/:id` | `user_social_media.read` *or* `user_social_media.read.own` (+ self match) | Get one row by id. |
| [§4.7](#47-post-apiv1user-social-medias) | `POST` | `{{baseUrl}}/api/v1/user-social-medias` | `user_social_media.create` | Admin create — targets any `userId`. |
| [§4.8](#48-patch-apiv1user-social-mediasid) | `PATCH` | `{{baseUrl}}/api/v1/user-social-medias/:id` | `user_social_media.update` *or* `user_social_media.update.own` (+ self match) | Admin or self partial update. |
| [§4.9](#49-delete-apiv1user-social-mediasid) | `DELETE` | `{{baseUrl}}/api/v1/user-social-medias/:id` | `user_social_media.delete` *or* `user_social_media.delete.own` (+ self match) | Admin or self soft-delete. |
| [§4.10](#410-post-apiv1user-social-mediasidrestore) | `POST` | `{{baseUrl}}/api/v1/user-social-medias/:id/restore` | `user_social_media.restore` (admin+) | Un-soft-delete a hidden row. |

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete and restore. |
| Admin | Everything **except** the global `user_social_media.delete` (admin still has `delete.own` and `restore`). |
| Instructor / Student | Self only — `read.own`, `update.own`, `delete.own`. No restore. |

### Platform reference

`social_medias` is phase-02 master data (seeded in `phase-02-master-data/social_medias`). Each platform has a `platform_type` discriminator (free-form text, but seeded values are `social`, `professional`, `code`, `messaging`) which is exposed on the list filter and on the nested `platform` object in responses.

| Column | Example values |
|---|---|
| `platformType` | `social` · `professional` · `code` · `messaging` |
| `name` / `code` | `Twitter` / `TWITTER`, `LinkedIn` / `LINKEDIN`, `GitHub` / `GITHUB`, `WhatsApp` / `WHATSAPP` |

---

## 4.1 `GET /api/v1/user-social-medias`

List user social-media rows. Backed by `udf_get_user_social_medias`, which joins `user_social_medias` → `users` → `social_medias`. Hides soft-deleted rows by default.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-social-medias` |
| Permission | `user_social_media.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `socialMediaId` | bigint | — | Filter by platform (FK to `social_medias`). |
| `platformType` | string | — | Free-form; seeded values are `social` / `professional` / `code` / `messaging`. |
| `isPrimary` | bool | — | Only the row the user flagged as their primary. |
| `isVerified` | bool | — | Admin-set verified flag. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted rows (admin audit view). |
| `userRole` | string | — | Parent user's role code. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across profile URL, username, platform name/code, first/last name, email. |
| `sortTable` | enum | `usm` | `usm` / `social_media` / `user`. |
| `sortColumn` | enum | `id` | See `user-social-medias.schemas.ts` for full allowlist. |
| `sortDirection` | enum | `DESC` | `ASC` / `DESC`. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 7,
      "userId": 42,
      "socialMediaId": 3,
      "profileUrl": "https://github.com/priya-sharma",
      "username": "priya-sharma",
      "isPrimary": true,
      "isVerified": false,
      "createdBy": 42,
      "updatedBy": 42,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T10:30:00.000Z",
      "updatedAt": "2026-04-11T10:30:00.000Z",
      "deletedAt": null,
      "user": {
        "firstName": "Priya",
        "lastName": "Sharma",
        "email": "priya.sharma@example.com",
        "role": "student",
        "isActive": true,
        "isDeleted": false
      },
      "platform": {
        "id": 3,
        "name": "GitHub",
        "code": "GITHUB",
        "baseUrl": "https://github.com",
        "platformType": "code",
        "displayOrder": 30,
        "isActive": true,
        "isDeleted": false
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: user_social_media.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-social-medias` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across profile url / username / platform name / user name / email | `?searchTerm=github` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=linkedin` |
| Single user — all rows | `?userId=42` |
| Filter by social_media id | `?socialMediaId=3` |
| Platform type — social | `?platformType=social` |
| Platform type — professional | `?platformType=professional` |
| Platform type — code | `?platformType=code` |
| Platform type — messaging | `?platformType=messaging` |
| Primary only | `?isPrimary=true` |
| Non-primary only | `?isPrimary=false` |
| Verified only | `?isVerified=true` |
| Unverified only | `?isVerified=false` |
| Active rows only | `?isActive=true` |
| Inactive rows only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by parent user role — student | `?userRole=student` |
| Filter by parent user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — usm table — `id` DESC (default) | `?sortTable=usm&sortColumn=id&sortDirection=DESC` |
| Sort — usm table — `profile_url` ASC | `?sortTable=usm&sortColumn=profile_url&sortDirection=ASC` |
| Sort — usm table — `username` ASC | `?sortTable=usm&sortColumn=username&sortDirection=ASC` |
| Sort — usm table — `is_primary` DESC | `?sortTable=usm&sortColumn=is_primary&sortDirection=DESC` |
| Sort — usm table — `is_verified` DESC | `?sortTable=usm&sortColumn=is_verified&sortDirection=DESC` |
| Sort — usm table — `is_active` DESC | `?sortTable=usm&sortColumn=is_active&sortDirection=DESC` |
| Sort — usm table — `is_deleted` DESC | `?sortTable=usm&sortColumn=is_deleted&sortDirection=DESC` |
| Sort — usm table — `created_at` DESC | `?sortTable=usm&sortColumn=created_at&sortDirection=DESC` |
| Sort — usm table — `updated_at` DESC | `?sortTable=usm&sortColumn=updated_at&sortDirection=DESC` |
| Sort — social_media — `name` ASC | `?sortTable=social_media&sortColumn=name&sortDirection=ASC` |
| Sort — social_media — `code` ASC | `?sortTable=social_media&sortColumn=code&sortDirection=ASC` |
| Sort — social_media — `platform_type` ASC | `?sortTable=social_media&sortColumn=platform_type&sortDirection=ASC` |
| Sort — social_media — `display_order` ASC | `?sortTable=social_media&sortColumn=display_order&sortDirection=ASC` |
| Sort — user — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — verified code platforms, newest first | `?pageIndex=1&pageSize=20&platformType=code&isVerified=true&sortTable=usm&sortColumn=created_at&sortDirection=DESC` |
| Combo — primary professional links | `?pageIndex=1&pageSize=50&platformType=professional&isPrimary=true&sortTable=social_media&sortColumn=display_order&sortDirection=ASC` |
| Combo — search `github`, active only, student users | `?pageIndex=1&pageSize=20&searchTerm=github&isActive=true&userRole=student&sortTable=usm&sortColumn=created_at&sortDirection=DESC` |

> The `sortTable` param defaults to `usm`. When sorting by a column that belongs to a different join source (`name`, `code`, `platform_type`, `display_order` live on `social_medias`; `first_name` / `last_name` / `email` / `role` live on `users`), set `sortTable` to `social_media` or `user`.

---

## 4.2 `GET /api/v1/user-social-medias/me`

List the caller's own social-media rows. `userId` filter is forced server-side — any `userId` query param is ignored.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/me` |
| Permission | `user_social_media.read.own` |

### Responses

#### 200 OK

Same shape as §4.1. Empty `data` array when the caller has no rows yet.

---

## 4.3 `POST /api/v1/user-social-medias/me`

Self-service create. `userId` is derived from the token.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/me` |
| Permission | `user_social_media.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body**

```json
{
  "socialMediaId": 3,
  "profileUrl": "https://github.com/priya-sharma",
  "username": "priya-sharma",
  "isPrimary": true
}
```

**Required:** `socialMediaId`, `profileUrl`. `username`, `isPrimary`, `isVerified`, `isActive` are optional.

> `isVerified` defaults to `false`. Users can send it on create but admins are expected to own verification flips in practice.
> Only **one** row per `(userId, socialMediaId)` pair — attempting to add a second row for the same platform fails with a unique-constraint `BAD_REQUEST`.

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Social media link created",
  "data": { /* full UserSocialMediaDto */ }
}
```

#### 400 Validation error — bad URL

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["profileUrl"], "message": "must be a valid URL" }
  ]
}
```

#### 400 Bad request — non-existent platform

```json
{
  "success": false,
  "message": "Error inserting user social media: Social media platform id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 4.4 `PATCH /api/v1/user-social-medias/me/:id`

Self-service partial update.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/me/:id` |
| Permission | `user_social_media.update.own` |

**Request body** — any subset of the create fields. Example:

```json
{
  "username": "priya.sharma",
  "isPrimary": false
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Social media link updated",
  "data": { /* full UserSocialMediaDto */ }
}
```

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": [], "message": "Provide at least one field to update" }
  ]
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only edit your own social media links.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Social media record 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.5 `DELETE /api/v1/user-social-medias/me/:id`

Self-service soft-delete. The row is marked `is_deleted=TRUE, is_active=FALSE` and hidden from the default GET. Hard-delete is not exposed.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/me/:id` |
| Permission | `user_social_media.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Social media link deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only delete your own social media links.",
  "code": "FORBIDDEN"
}
```

> No self-restore — see §4.10 for the admin restore path.

---

## 4.6 `GET /api/v1/user-social-medias/:id`

Get one row by id. `authorizeSelfOr` pattern — admins read any row, self reads own row.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/:id` |
| Permission | `user_social_media.read` *or* `user_social_media.read.own` |

### Responses

#### 200 OK

Single `UserSocialMediaDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_social_media.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, or is soft-deleted.

---

## 4.7 `POST /api/v1/user-social-medias`

Admin create — body requires `userId` explicitly.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-social-medias` |
| Permission | `user_social_media.create` |

**Request body**

```json
{
  "userId": 42,
  "socialMediaId": 2,
  "profileUrl": "https://www.linkedin.com/in/priya-sharma",
  "username": "priya-sharma",
  "isPrimary": true,
  "isVerified": true
}
```

### Responses

#### 201 Created

Same shape as §4.3.

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user social media: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — parent user inactive (activating row)

```json
{
  "success": false,
  "message": "Error inserting user social media: Cannot create active social media record: user id 42 is inactive.",
  "code": "BAD_REQUEST"
}
```

---

## 4.8 `PATCH /api/v1/user-social-medias/:id`

`authorizeSelfOr` — admins edit any row, self edits own row.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/:id` |
| Permission | `user_social_media.update` *or* `user_social_media.update.own` |

### Responses

#### 200 OK

Full updated `UserSocialMediaDto`.

#### 403 Forbidden — own-scope on a foreign row

Same shape as §4.6.

#### 400 Bad request — soft-deleted row

```json
{
  "success": false,
  "message": "Error updating user social media: No active social media record found with id 42.",
  "code": "BAD_REQUEST"
}
```

> The update UDF refuses to touch a soft-deleted row — restore it first via §4.10.

---

## 4.9 `DELETE /api/v1/user-social-medias/:id`

Admin or self soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/:id` |
| Permission | `user_social_media.delete` *or* `user_social_media.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Social media link deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — already deleted / unknown id

```json
{
  "success": false,
  "message": "Error deleting user social media: No active social media record found to delete with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 4.10 `POST /api/v1/user-social-medias/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. The route uses `getByIdIncludingDeleted` to surface a clean `404` / `400` before the UDF runs.

The UDF validates both parents: the owning `users` row AND the referenced `social_medias` row must still be active / not deleted. If the platform itself has been retired, update the row to reference a live platform first.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-social-medias/:id/restore` |
| Permission | `user_social_media.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Social media link restored",
  "data": { /* full UserSocialMediaDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "Social media record 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user social media: Cannot restore social media record 42: owning user 9 is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — platform is deleted

```json
{
  "success": false,
  "message": "Error restoring user social media: Cannot restore social media record 42: platform 3 is deleted. Update the row first.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_social_media.restore`

```json
{
  "success": false,
  "message": "Missing required permission: user_social_media.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Social media record 42 not found",
  "code": "NOT_FOUND"
}
```

---

## DTO reference

The full `UserSocialMediaDto` definition lives in [`api/src/modules/user-social-medias/user-social-medias.service.ts`](../../../api/src/modules/user-social-medias/user-social-medias.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId`, `socialMediaId` | Primary key + FKs (both NOT NULL). `(userId, socialMediaId)` is unique. |
| `profileUrl`, `username` | Public link + optional handle for display. |
| `isPrimary` | User's "main" handle for that platform. Only one per user is conventional but not enforced by DB. |
| `isVerified` | Admin-set flag. Users can pre-fill it but admins own the source of truth. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary (first/last name, email, role, active/deleted). |
| `platform` | Nested `social_medias` lookup — `name`, `code`, `baseUrl`, `platformType`, `displayOrder`. |

← [03 user-experience](03%20-%20user-experience.md) · **Next →** [05 user-skills](05%20-%20user-skills.md)
