# Phase 4 — User Languages

`user_languages` is a **1:M child of `users`** mapping each user to the languages they speak, along with how well they speak them (proficiency level), which modalities they're comfortable in (`canRead` / `canWrite` / `canSpeak`), and two flags — `isPrimary` (their working language) and `isNative` (their mother tongue). Every row references the phase-02 `languages` master-data lookup via a NOT NULL FK, so you can never point at a language that doesn't exist. A unique `(user_id, language_id)` constraint means a user can have at most one row per language — you don't list "Hindi" twice.

Same **soft-delete + admin restore** model as `user_skills`, same `/me` + `/:id` split. If you've read [§5](05%20-%20user-skills.md) the shape will feel identical; the differences are the column set and the filter knobs.

All routes require auth. Permission codes use the **singular** resource name `user_language`: `user_language.create`, `user_language.read`, `user_language.read.own`, `user_language.update`, `user_language.update.own`, `user_language.delete`, `user_language.delete.own`, `user_language.restore`.

> The table name is plural (`user_languages`) but the permission resource is singular (`user_language`). The API path mirrors the table name: `/api/v1/user-languages`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [05 user-skills](05%20-%20user-skills.md) · **Next →** [07 user-documents](07%20-%20user-documents.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§6.1](#61-get-apiv1user-languages) | `GET` | `{{baseUrl}}/api/v1/user-languages` | `user_language.read` | List all user-language rows (admin+). |
| [§6.2](#62-get-apiv1user-languagesme) | `GET` | `{{baseUrl}}/api/v1/user-languages/me` | `user_language.read.own` | List caller's own language rows. |
| [§6.3](#63-post-apiv1user-languagesme) | `POST` | `{{baseUrl}}/api/v1/user-languages/me` | `user_language.update.own` | Self-service create — `userId` derived from token. |
| [§6.4](#64-patch-apiv1user-languagesmeid) | `PATCH` | `{{baseUrl}}/api/v1/user-languages/me/:id` | `user_language.update.own` (self match enforced) | Self-service partial update. |
| [§6.5](#65-delete-apiv1user-languagesmeid) | `DELETE` | `{{baseUrl}}/api/v1/user-languages/me/:id` | `user_language.delete.own` (self match enforced) | Self-service soft-delete. |
| [§6.6](#66-get-apiv1user-languagesid) | `GET` | `{{baseUrl}}/api/v1/user-languages/:id` | `user_language.read` *or* `user_language.read.own` (+ self match) | Get one row by id. |
| [§6.7](#67-post-apiv1user-languages) | `POST` | `{{baseUrl}}/api/v1/user-languages` | `user_language.create` | Admin create — targets any `userId`. |
| [§6.8](#68-patch-apiv1user-languagesid) | `PATCH` | `{{baseUrl}}/api/v1/user-languages/:id` | `user_language.update` *or* `user_language.update.own` (+ self match) | Admin or self partial update. |
| [§6.9](#69-delete-apiv1user-languagesid) | `DELETE` | `{{baseUrl}}/api/v1/user-languages/:id` | `user_language.delete` *or* `user_language.delete.own` (+ self match) | Admin or self soft-delete. |
| [§6.10](#610-post-apiv1user-languagesidrestore) | `POST` | `{{baseUrl}}/api/v1/user-languages/:id/restore` | `user_language.restore` (admin+) | Un-soft-delete a hidden row. |

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete and restore. |
| Admin | Everything **except** the global `user_language.delete` (admin still has `delete.own` and `restore`). |
| Instructor / Student | Self only — `read.own`, `update.own`, `delete.own`. No restore. |

### Proficiency level reference

The `proficiencyLevel` column is constrained to the values below — both the DB CHECK constraint and the zod schema reject anything else. Default is `basic` when omitted on create.

| Value | Intended meaning |
|---|---|
| `basic` | A few phrases; tourist / survival level. |
| `conversational` | Can hold day-to-day chats on familiar topics. |
| `professional` | Can work in this language — meetings, emails, docs. |
| `fluent` | Near-native ease; can discuss nuance and abstract topics. |
| `native` | Native speaker / mother tongue. |

> The `isNative` flag and `proficiencyLevel='native'` are independent — `isNative` records identity (your mother tongue), `native`-level proficiency records ability. They'll usually match for a user's first language but don't have to for e.g. heritage speakers.

### Modality flags

| Field | Default | Meaning |
|---|---|---|
| `canRead` | `false` | Caller can read text in this language. |
| `canWrite` | `false` | Caller can write in this language (not just type). |
| `canSpeak` | `false` | Caller can hold a spoken conversation. |

All three default to `false` on create and can be updated independently. Pagination and filter knobs (`?canRead=true`, `?canSpeak=true`, …) let you slice by modality — e.g. "everyone who can read Hindi but not necessarily speak it".

### Language master-data reference

`languages` is phase-02 master data (seeded in `phase-02-master-data/languages`). The nested `language` object in responses exposes `id`, `name`, `nativeName`, `isoCode`, `script`, and the master-data row's own `isActive` / `isDeleted` flags. `script` is a free-form text column on the master row (examples: `Latin`, `Devanagari`, `Cyrillic`, `Arabic`).

---

## 6.1 `GET /api/v1/user-languages`

List user-language rows. Backed by `udf_get_user_languages`, which joins `user_languages` → `users` → `languages`. Hides soft-deleted rows by default.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-languages` |
| Permission | `user_language.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `languageId` | bigint | — | Filter by language (FK to `languages`). |
| `proficiencyLevel` | enum | — | `basic` / `conversational` / `professional` / `fluent` / `native`. |
| `languageScript` | string | — | Free-form match against `languages.script` (e.g. `Devanagari`). |
| `isPrimary` | bool | — | Only rows the user flagged as their working language. |
| `isNative` | bool | — | Only rows flagged as the user's mother tongue. |
| `canRead` | bool | — | Modality filter — user can read this language. |
| `canWrite` | bool | — | Modality filter — user can write this language. |
| `canSpeak` | bool | — | Modality filter — user can speak this language. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted rows (admin audit view). |
| `userRole` | string | — | Parent user's role code. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across language name / native name / iso code / script, first/last name, email. |
| `sortTable` | enum | `ulang` | `ulang` / `language` / `user`. |
| `sortColumn` | enum | `id` | See `user-languages.schemas.ts` for the full allowlist. |
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
      "id": 12,
      "userId": 42,
      "languageId": 3,
      "proficiencyLevel": "fluent",
      "canRead": true,
      "canWrite": true,
      "canSpeak": true,
      "isPrimary": true,
      "isNative": false,
      "createdBy": 42,
      "updatedBy": 42,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T01:30:00.000Z",
      "updatedAt": "2026-04-12T01:30:00.000Z",
      "deletedAt": null,
      "user": {
        "firstName": "Priya",
        "lastName": "Sharma",
        "email": "priya.sharma@example.com",
        "role": "student",
        "isActive": true,
        "isDeleted": false
      },
      "language": {
        "id": 3,
        "name": "Hindi",
        "nativeName": "हिन्दी",
        "isoCode": "hi",
        "script": "Devanagari",
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
  "message": "Missing required permission: user_language.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-languages` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across language name / iso_code / script / user name / email | `?searchTerm=hindi` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=spanish` |
| Single user — all rows | `?userId=42` |
| Single user — primary language only | `?userId=42&isPrimary=true` |
| Filter by language id | `?languageId=1` |
| Proficiency — basic | `?proficiencyLevel=basic` |
| Proficiency — conversational | `?proficiencyLevel=conversational` |
| Proficiency — professional | `?proficiencyLevel=professional` |
| Proficiency — fluent | `?proficiencyLevel=fluent` |
| Proficiency — native | `?proficiencyLevel=native` |
| Script — Latin | `?languageScript=Latin` |
| Script — Devanagari | `?languageScript=Devanagari` |
| Script — Arabic | `?languageScript=Arabic` |
| Script — Cyrillic | `?languageScript=Cyrillic` |
| Primary languages only | `?isPrimary=true` |
| Non-primary languages | `?isPrimary=false` |
| Native speakers only | `?isNative=true` |
| Non-native speakers | `?isNative=false` |
| Can read | `?canRead=true` |
| Cannot read | `?canRead=false` |
| Can write | `?canWrite=true` |
| Cannot write | `?canWrite=false` |
| Can speak | `?canSpeak=true` |
| Cannot speak | `?canSpeak=false` |
| Active rows only | `?isActive=true` |
| Inactive rows only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by parent user role — student | `?userRole=student` |
| Filter by parent user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — ulang table — `id` DESC (default) | `?sortTable=ulang&sortColumn=id&sortDirection=DESC` |
| Sort — ulang table — `proficiency_level` DESC | `?sortTable=ulang&sortColumn=proficiency_level&sortDirection=DESC` |
| Sort — ulang table — `is_primary` DESC | `?sortTable=ulang&sortColumn=is_primary&sortDirection=DESC` |
| Sort — ulang table — `is_native` DESC | `?sortTable=ulang&sortColumn=is_native&sortDirection=DESC` |
| Sort — ulang table — `is_active` DESC | `?sortTable=ulang&sortColumn=is_active&sortDirection=DESC` |
| Sort — ulang table — `created_at` DESC | `?sortTable=ulang&sortColumn=created_at&sortDirection=DESC` |
| Sort — ulang table — `updated_at` DESC | `?sortTable=ulang&sortColumn=updated_at&sortDirection=DESC` |
| Sort — language — `name` ASC | `?sortTable=language&sortColumn=name&sortDirection=ASC` |
| Sort — language — `native_name` ASC | `?sortTable=language&sortColumn=native_name&sortDirection=ASC` |
| Sort — language — `iso_code` ASC | `?sortTable=language&sortColumn=iso_code&sortDirection=ASC` |
| Sort — language — `script` ASC | `?sortTable=language&sortColumn=script&sortDirection=ASC` |
| Sort — user — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — fluent+native, can read+write+speak | `?pageIndex=1&pageSize=20&proficiencyLevel=fluent&canRead=true&canWrite=true&canSpeak=true&sortTable=language&sortColumn=name&sortDirection=ASC` |
| Combo — native speakers, primary only | `?pageIndex=1&pageSize=50&isNative=true&isPrimary=true&sortTable=ulang&sortColumn=created_at&sortDirection=DESC` |
| Combo — search `hindi`, Devanagari script | `?pageIndex=1&pageSize=20&searchTerm=hindi&languageScript=Devanagari&sortTable=language&sortColumn=name&sortDirection=ASC` |

> The `sortTable` param defaults to `ulang`. When sorting by a column that belongs to `languages` (`name`, `native_name`, `iso_code`, `script`) or `users` (`first_name` / `last_name` / `email` / `role`), set `sortTable` to `language` or `user`.

---

## 6.2 `GET /api/v1/user-languages/me`

List the caller's own language rows. `userId` filter is forced server-side — any `userId` query param is ignored.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-languages/me` |
| Permission | `user_language.read.own` |

### Responses

#### 200 OK

Same shape as §6.1. Empty `data` array when the caller has no rows yet.

---

## 6.3 `POST /api/v1/user-languages/me`

Self-service create. `userId` is derived from the token.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-languages/me` |
| Permission | `user_language.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body**

```json
{
  "languageId": 3,
  "proficiencyLevel": "fluent",
  "canRead": true,
  "canWrite": true,
  "canSpeak": true,
  "isPrimary": true,
  "isNative": false
}
```

**Required:** `languageId`. `proficiencyLevel` (default `basic`), `canRead` / `canWrite` / `canSpeak` (default `false`), `isPrimary` (default `false`), `isNative` (default `false`), `isActive` (default `true`) are all optional.

> Only **one** row per `(userId, languageId)` pair — attempting to add a second row for the same language fails with a unique-constraint `BAD_REQUEST`.

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "User language created",
  "data": { /* full UserLanguageDto */ }
}
```

#### 400 Validation error — bad proficiency level

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": ["proficiencyLevel"],
      "message": "Invalid enum value. Expected 'basic' | 'conversational' | 'professional' | 'fluent' | 'native', received 'superhuman'"
    }
  ]
}
```

#### 400 Validation error — missing `languageId`

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["languageId"], "message": "Required" }
  ]
}
```

#### 400 Bad request — non-existent language

```json
{
  "success": false,
  "message": "Error inserting user language: Language id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 6.4 `PATCH /api/v1/user-languages/me/:id`

Self-service partial update.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-languages/me/:id` |
| Permission | `user_language.update.own` |

**Request body** — any subset of the create fields. Example:

```json
{
  "proficiencyLevel": "native",
  "canWrite": true,
  "isPrimary": false
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User language updated",
  "data": { /* full UserLanguageDto */ }
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
  "message": "You can only edit your own languages.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User language 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 6.5 `DELETE /api/v1/user-languages/me/:id`

Self-service soft-delete. The row is marked `is_deleted=TRUE, is_active=FALSE` and hidden from the default GET. Hard-delete is not exposed.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-languages/me/:id` |
| Permission | `user_language.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User language deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only delete your own languages.",
  "code": "FORBIDDEN"
}
```

> No self-restore — see §6.10 for the admin restore path.

---

## 6.6 `GET /api/v1/user-languages/:id`

Get one row by id. `authorizeSelfOr` pattern — admins read any row, self reads own row.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-languages/:id` |
| Permission | `user_language.read` *or* `user_language.read.own` |

### Responses

#### 200 OK

Single `UserLanguageDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_language.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, or is soft-deleted.

---

## 6.7 `POST /api/v1/user-languages`

Admin create — body requires `userId` explicitly.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-languages` |
| Permission | `user_language.create` |

**Request body**

```json
{
  "userId": 42,
  "languageId": 3,
  "proficiencyLevel": "fluent",
  "canRead": true,
  "canWrite": true,
  "canSpeak": true,
  "isPrimary": true,
  "isNative": false
}
```

### Responses

#### 201 Created

Same shape as §6.3.

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user language: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — parent user inactive (activating row)

```json
{
  "success": false,
  "message": "Error inserting user language: Cannot create active user language: user id 42 is inactive.",
  "code": "BAD_REQUEST"
}
```

---

## 6.8 `PATCH /api/v1/user-languages/:id`

`authorizeSelfOr` — admins edit any row, self edits own row.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-languages/:id` |
| Permission | `user_language.update` *or* `user_language.update.own` |

### Responses

#### 200 OK

Full updated `UserLanguageDto`.

#### 403 Forbidden — own-scope on a foreign row

Same shape as §6.6.

#### 400 Bad request — soft-deleted row

```json
{
  "success": false,
  "message": "Error updating user language: No active user language found with id 42.",
  "code": "BAD_REQUEST"
}
```

> The update UDF refuses to touch a soft-deleted row — restore it first via §6.10.

---

## 6.9 `DELETE /api/v1/user-languages/:id`

Admin or self soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-languages/:id` |
| Permission | `user_language.delete` *or* `user_language.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User language deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — already deleted / unknown id

```json
{
  "success": false,
  "message": "Error deleting user language: No active user language found to delete with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 6.10 `POST /api/v1/user-languages/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. The route uses `getByIdIncludingDeleted` to surface a clean `404` / `400` before the UDF runs.

The UDF validates both parents: the owning `users` row AND the referenced `languages` master row must still be active / not deleted. If the language itself has been retired, update the row to reference a live language first.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-languages/:id/restore` |
| Permission | `user_language.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User language restored",
  "data": { /* full UserLanguageDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "User language 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user language: Cannot restore user language 42: owning user 9 is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — language master row is deleted

```json
{
  "success": false,
  "message": "Error restoring user language: Cannot restore user language 42: language 3 is deleted. Update the row first.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_language.restore`

```json
{
  "success": false,
  "message": "Missing required permission: user_language.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User language 42 not found",
  "code": "NOT_FOUND"
}
```

---

## DTO reference

The full `UserLanguageDto` definition lives in [`api/src/modules/user-languages/user-languages.service.ts`](../../../api/src/modules/user-languages/user-languages.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId`, `languageId` | Primary key + FKs (both NOT NULL). `(userId, languageId)` is unique. |
| `proficiencyLevel` | One of `basic` / `conversational` / `professional` / `fluent` / `native`. |
| `canRead`, `canWrite`, `canSpeak` | Modality flags — what the user can actually do in the language. |
| `isPrimary` | User's working / preferred language. Only one per user is conventional but not DB-enforced. |
| `isNative` | Mother-tongue flag. Distinct from `proficiencyLevel='native'`. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary (first/last name, email, role, active/deleted). |
| `language` | Nested `languages` lookup — `name`, `nativeName`, `isoCode`, `script`, plus master-data active/deleted flags. |

← [05 user-skills](05%20-%20user-skills.md) · **Next →** [07 user-documents](07%20-%20user-documents.md)
