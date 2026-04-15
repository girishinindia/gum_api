# Phase 8 — Subjects

Top-level knowledge domain: **Subject** (e.g. *Mathematics*, *Data Science*, *Literature*). Exposes parent CRUD and a nested per-language translation sub-resource with four image slots (icon, image, ogImage, twitterImage).

All routes require auth. Permission codes: `subject.read`, `subject.create`, `subject.update`, `subject.delete`, `subject.restore`.

Uses the Postman variables **`{{baseUrl}}`** and **`{{accessToken}}`** from the shared environment.

← [overview](00%20-%20overview.md) · **Next →** [chapters](02%20-%20chapters.md)

---

## Endpoint summary

| § | Method | Path | Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11) | `GET` | `/api/v1/subjects` | `subject.read` | List subjects. |
| [§1.2](#12) | `GET` | `/api/v1/subjects/:id` | `subject.read` | Get one subject. |
| [§1.3](#13) | `POST` | `/api/v1/subjects` | `subject.create` | Create subject (optional embedded translation). |
| [§1.4](#14) | `PATCH` | `/api/v1/subjects/:id` | `subject.update` | Partial update (text only — JSON). |
| [§1.5](#15) | `DELETE` | `/api/v1/subjects/:id` | `subject.delete` | Soft-delete. |
| [§1.6](#16) | `POST` | `/api/v1/subjects/:id/restore` | `subject.restore` | Undo soft-delete. |
| [§1.7](#17) | `GET` | `/api/v1/subjects/:id/translations` | `subject.read` | List translations for a subject. |
| [§1.8](#18) | `GET` | `/api/v1/subjects/:id/translations/:tid` | `subject.read` | Get one translation. |
| [§1.9](#19) | `POST` | `/api/v1/subjects/:id/translations` | `subject.create` | Create translation — JSON or multipart (+ images). |
| [§1.10](#110) | `PATCH` | `/api/v1/subjects/:id/translations/:tid` | `subject.update` | Update translation — JSON or multipart (+ images). |
| [§1.11](#111) | `DELETE` | `/api/v1/subjects/:id/translations/:tid` | `subject.delete` | Soft-delete translation. |
| [§1.12](#112) | `POST` | `/api/v1/subjects/:id/translations/:tid/restore` | `subject.restore` | Undo translation soft-delete. |

---

## 1.1 `GET /api/v1/subjects`

List subjects.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/subjects` |
| Permission | `subject.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based. |
| `pageSize` | int | `20` | Max `100`. |
| `searchTerm` | string | — | `ILIKE` across `code` / `slug`. |
| `isActive` | bool | — | |
| `isDeleted` | bool | — | Super-admin only. |
| `difficultyLevel` | enum | — | `beginner|intermediate|advanced|expert|all_levels`. |
| `sortColumn` | enum | `display_order` | `id`, `code`, `slug`, `difficulty_level`, `estimated_hours`, `display_order`, `view_count`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` / `DESC`. |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "code": "MATH",
      "slug": "mathematics",
      "difficultyLevel": "intermediate",
      "estimatedHours": 120,
      "viewCount": 0,
      "displayOrder": 1,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-15T00:00:00.000Z",
      "updatedAt": "2026-04-15T00:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 400 VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN

Standard envelopes — see [overview §Common errors](#common-errors).

---

## 1.2 `GET /api/v1/subjects/:id`

Read a single subject by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/subjects/:id` |
| Permission | `subject.read` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "code": "MATH",
    "slug": "mathematics",
    "difficultyLevel": "intermediate",
    "estimatedHours": 120,
    "viewCount": 0,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-15T00:00:00.000Z",
    "updatedAt": "2026-04-15T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Subject 9999 not found", "code": "NOT_FOUND" }
```

---

## 1.3 `POST /api/v1/subjects`

Create a subject with an optional embedded translation (translation images are NOT supplied on this route — the upload pipeline only runs on the nested translations endpoint).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/subjects` |
| Permission | `subject.create` |
| Content-Type | `application/json` |

**Request body**

```json
{
  "code": "MATH",
  "difficultyLevel": "intermediate",
  "estimatedHours": 120,
  "displayOrder": 1,
  "note": "Core curriculum",
  "isActive": true,
  "translation": {
    "languageId": 1,
    "name": "Mathematics",
    "shortIntro": "Numbers, structure, space, change.",
    "longIntro": "A comprehensive subject covering algebra, geometry, calculus, and statistics."
  }
}
```

**Required fields**: `code`. **Optional**: everything else (with `isActive` defaulting to `false` server-side).

### Responses

#### 201 CREATED

```json
{
  "success": true,
  "message": "Subject created",
  "data": {
    "id": 1,
    "code": "MATH",
    "slug": "mathematics",
    "difficultyLevel": "intermediate",
    "estimatedHours": 120,
    "displayOrder": 1,
    "viewCount": 0,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-15T00:00:00.000Z",
    "updatedAt": "2026-04-15T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR / 401 / 403 / 409 DUPLICATE_ENTRY — standard.

---

## 1.4 `PATCH /api/v1/subjects/:id`

Partial update of parent row (JSON only — no images at the parent level).

**Body**

```json
{ "difficultyLevel": "advanced", "estimatedHours": 140, "isActive": true }
```

Empty body → `400 BAD_REQUEST — Provide at least one field to update`.

### 200 OK

Same shape as §1.2.

---

## 1.5 `DELETE /api/v1/subjects/:id`

Soft delete. Permission: `subject.delete`.

### 200 OK

```json
{ "success": true, "message": "Subject deleted", "data": { "id": 1, "deleted": true } }
```

---

## 1.6 `POST /api/v1/subjects/:id/restore`

Undo soft delete. Permission: `subject.restore`.

### 200 OK — row shape matches §1.2.

---

## 1.7 `GET /api/v1/subjects/:id/translations`

List translations belonging to a subject.

**Query params**: `pageIndex`, `pageSize`, `searchTerm` (over `name`), `languageId`, `isActive`, `isDeleted`, `sortColumn` (`id|name|language_id|subject_id|created_at`), `sortDirection`.

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 10,
      "subjectId": 1,
      "languageId": 1,
      "name": "Mathematics",
      "shortIntro": "Numbers, structure, space, change.",
      "longIntro": "...",
      "icon": "https://cdn.growupmore.com/subjects/translations/10/icon.webp",
      "image": "https://cdn.growupmore.com/subjects/translations/10/image.webp",
      "ogImage": "https://cdn.growupmore.com/subjects/translations/10/og-image.webp",
      "twitterImage": "https://cdn.growupmore.com/subjects/translations/10/twitter-image.webp",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-15T00:00:00.000Z",
      "updatedAt": "2026-04-15T00:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

---

## 1.8 `GET /api/v1/subjects/:id/translations/:tid`

Single translation by id — same row shape as one element of §1.7.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Subject translation 9999 not found", "code": "NOT_FOUND" }
```

---

## 1.9 `POST /api/v1/subjects/:id/translations`

Create a subject translation. Accepts **JSON** or **multipart/form-data**. Permission: `subject.create`.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` **or** `multipart/form-data` |

### Body — all supported fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | yes | FK → `languages.id`. |
| `name` | string | yes | ≤ 255 chars. |
| `shortIntro` / `longIntro` | string | no | ≤ 5000 chars. |
| `videoTitle` / `videoDescription` / `videoThumbnail` | string | no | |
| `videoDurationMinutes` | number | no | |
| `tags` / `structuredData` | JSON | no | Any JSON — stringify on multipart. |
| `metaTitle` / `metaDescription` / `metaKeywords` / `canonicalUrl` | string | no | |
| `ogSiteName` / `ogTitle` / `ogDescription` / `ogType` / `ogUrl` | string | no | |
| `twitterSite` / `twitterTitle` / `twitterDescription` / `twitterCard` | string | no | |
| `robotsDirective` / `focusKeyword` / `authorName` / `authorBio` | string | no | |
| `icon` / `image` / `ogImage` / `twitterImage` | **file** | no | Multipart only — see [image contract](00%20-%20overview.md#image-upload-contract-common-to-all-four-resources). |

### The 3 upload scenarios

Per the user's spec, these are the three concrete Postman variants:

#### (A) POST — JSON, no images

`Content-Type: application/json`

```json
{
  "languageId": 1,
  "name": "Mathematics",
  "shortIntro": "Numbers, structure, space, change."
}
```

#### (B) POST — multipart + all 4 image slots

`Content-Type: multipart/form-data`

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Mathematics` |
| `shortIntro` | text | `Numbers, structure, space, change.` |
| `icon` | **file** | `math-icon-256.png` |
| `image` | **file** | `math-hero-512.webp` |
| `ogImage` | **file** | `math-og-512.webp` |
| `twitterImage` | **file** | `math-twitter-512.webp` |

#### (C) POST — multipart + one image slot only

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Mathematics` |
| `icon` | **file** | `math-icon-256.png` |

### 201 CREATED

```json
{
  "success": true,
  "message": "Subject translation created",
  "data": {
    "id": 10,
    "subjectId": 1,
    "languageId": 1,
    "name": "Mathematics",
    "icon": "https://cdn.growupmore.com/subjects/translations/10/icon.webp",
    "image": "https://cdn.growupmore.com/subjects/translations/10/image.webp",
    "ogImage": "https://cdn.growupmore.com/subjects/translations/10/og-image.webp",
    "twitterImage": "https://cdn.growupmore.com/subjects/translations/10/twitter-image.webp",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-15T00:00:00.000Z",
    "updatedAt": "2026-04-15T00:00:00.000Z"
  }
}
```

### Errors

* `400 VALIDATION_ERROR` — missing `languageId` or `name`.
* `400 BAD_REQUEST` — file too large (> 200 KB raw), unreadable image, or image too complex to compress ≤ 100 KB after quality-loop.
* `400 BAD_REQUEST` — `Unsupported media type: expected image/png, image/jpeg, image/webp, or image/svg+xml`.
* `401 UNAUTHORIZED` / `403 FORBIDDEN` — standard.
* `409 DUPLICATE_ENTRY` — `(subject_id, language_id)` already exists.
* `502 BUNNY_UPLOAD_FAILED` — Bunny PUT failed.

---

## 1.10 `PATCH /api/v1/subjects/:id/translations/:tid`

Partial update. Accepts **JSON** or **multipart/form-data**. Permission: `subject.update`.

Rule: at least **one** of `hasTextChange || hasFile` must be present. Sending an empty body with no files → `400 BAD_REQUEST — Provide at least one field to update`.

### The 5 update scenarios

#### (1) PATCH — JSON, text change only (no images)

`Content-Type: application/json`

```json
{ "name": "Mathematics (revised)", "shortIntro": "Updated intro line." }
```

#### (2) PATCH — multipart, text + single image replacement

| Key | Type | Value |
|---|---|---|
| `name` | text | `Mathematics (revised)` |
| `icon` | **file** | `math-icon-v2.png` |

#### (3) PATCH — multipart, text + all 4 image slots

| Key | Type | Value |
|---|---|---|
| `name` | text | `Mathematics (v3)` |
| `shortIntro` | text | `Cleaner intro.` |
| `icon` | **file** | `math-icon-v3.png` |
| `image` | **file** | `math-hero-v3.png` |
| `ogImage` | **file** | `math-og-v3.png` |
| `twitterImage` | **file** | `math-twitter-v3.png` |

#### (4) PATCH — multipart, single image slot only (no text)

| Key | Type | Value |
|---|---|---|
| `icon` | **file** | `math-icon-hotfix.png` |

#### (5) PATCH — multipart, replace all 4 images (no text)

| Key | Type | Value |
|---|---|---|
| `icon` | **file** | `math-icon-v4.png` |
| `image` | **file** | `math-hero-v4.png` |
| `ogImage` | **file** | `math-og-v4.png` |
| `twitterImage` | **file** | `math-twitter-v4.png` |

### 200 OK

Same shape as §1.8.

### Errors

* `400 BAD_REQUEST — Provide at least one field to update` — empty body, no files.
* `400 BAD_REQUEST — Subject translation {slot} is too complex to compress under 100 KB. Try a simpler image.` — sharp quality-loop bottomed out.
* All standard 4xx / `502 BUNNY_UPLOAD_FAILED`.

---

## 1.11 `DELETE /api/v1/subjects/:id/translations/:tid`

Soft delete translation. Permission: `subject.delete`.

### 200 OK

```json
{ "success": true, "message": "Subject translation deleted", "data": { "id": 10, "deleted": true } }
```

---

## 1.12 `POST /api/v1/subjects/:id/translations/:tid/restore`

Undo soft delete. Permission: `subject.restore`. 200 OK returns the refreshed translation row.

---

## Common errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected body, query, or params. |
| 400 | `BAD_REQUEST` | Business rule — empty PATCH, already-deleted row on restore, file cap exceeded, unreadable image. |
| 401 | `UNAUTHORIZED` | Missing / expired bearer. |
| 403 | `FORBIDDEN` | Missing required permission. |
| 404 | `NOT_FOUND` | No subject or translation with that id. |
| 409 | `DUPLICATE_ENTRY` | `(subject_id, language_id)` clash or duplicate `code`/`slug`. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate limit tripped. |
| 500 | `INTERNAL_ERROR` | Unhandled exception. |
| 502 | `BUNNY_UPLOAD_FAILED` | CDN PUT failure. |
