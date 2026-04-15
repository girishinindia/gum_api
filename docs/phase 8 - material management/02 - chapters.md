# Phase 8 — Chapters

A **Chapter** is a major unit of a Subject (e.g. *Linear Algebra* under *Mathematics*). Same shape as Subjects — parent row + per-language translation with four image slots.

All routes require auth. Permission codes: `chapter.read`, `chapter.create`, `chapter.update`, `chapter.delete`, `chapter.restore`.

← [subjects](01%20-%20subjects.md) · **Next →** [topics](03%20-%20topics.md)

---

## Endpoint summary

| § | Method | Path | Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21) | `GET` | `/api/v1/chapters` | `chapter.read` | List chapters. |
| [§2.2](#22) | `GET` | `/api/v1/chapters/:id` | `chapter.read` | Get one chapter. |
| [§2.3](#23) | `POST` | `/api/v1/chapters` | `chapter.create` | Create chapter. |
| [§2.4](#24) | `PATCH` | `/api/v1/chapters/:id` | `chapter.update` | Partial update (JSON only). |
| [§2.5](#25) | `DELETE` | `/api/v1/chapters/:id` | `chapter.delete` | Soft-delete. |
| [§2.6](#26) | `POST` | `/api/v1/chapters/:id/restore` | `chapter.restore` | Undo soft-delete. |
| [§2.7](#27) | `GET` | `/api/v1/chapters/:id/translations` | `chapter.read` | List translations. |
| [§2.8](#28) | `GET` | `/api/v1/chapters/:id/translations/:tid` | `chapter.read` | Get one translation. |
| [§2.9](#29) | `POST` | `/api/v1/chapters/:id/translations` | `chapter.create` | Create translation — JSON or multipart (+ images). |
| [§2.10](#210) | `PATCH` | `/api/v1/chapters/:id/translations/:tid` | `chapter.update` | Update translation — JSON or multipart (+ images). |
| [§2.11](#211) | `DELETE` | `/api/v1/chapters/:id/translations/:tid` | `chapter.delete` | Soft-delete translation. |
| [§2.12](#212) | `POST` | `/api/v1/chapters/:id/translations/:tid/restore` | `chapter.restore` | Undo translation soft-delete. |

---

## 2.1 `GET /api/v1/chapters`

List chapters.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` / `pageSize` | int | `1` / `20` | |
| `searchTerm` | string | — | `ILIKE` over `code` / `slug`. |
| `subjectId` | int | — | Filter by parent subject. |
| `difficultyLevel` | enum | — | `beginner|intermediate|advanced|expert|all_levels`. |
| `isActive` / `isDeleted` | bool | — | |
| `sortColumn` | enum | `display_order` | `id`, `code`, `slug`, `subject_id`, `difficulty_level`, `estimated_hours`, `display_order`, `view_count`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | |

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "code": "MATH-ALG",
      "slug": "linear-algebra",
      "subjectId": 1,
      "difficultyLevel": "intermediate",
      "estimatedHours": 20,
      "displayOrder": 1,
      "viewCount": 0,
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

## 2.2 `GET /api/v1/chapters/:id`

Row shape matches §2.1 element; `404` — `Chapter 9999 not found`.

---

## 2.3 `POST /api/v1/chapters`

Create chapter. JSON only.

```json
{
  "code": "MATH-ALG",
  "subjectId": 1,
  "difficultyLevel": "intermediate",
  "estimatedHours": 20,
  "displayOrder": 1,
  "isActive": true,
  "translation": {
    "languageId": 1,
    "name": "Linear Algebra",
    "shortIntro": "Vectors, matrices, and transformations."
  }
}
```

Required: `code`, `subjectId`. 201 returns the chapter row.

---

## 2.4 `PATCH /api/v1/chapters/:id`

JSON partial update. Empty body → `400`.

---

## 2.5 `DELETE /api/v1/chapters/:id`

Soft-delete. 200 OK — `{ id, deleted: true }`.

---

## 2.6 `POST /api/v1/chapters/:id/restore`

Undo soft-delete.

---

## 2.7 `GET /api/v1/chapters/:id/translations`

List translations for a chapter. Query params: `pageIndex`, `pageSize`, `searchTerm`, `languageId`, `isActive`, `isDeleted`, `sortColumn` (`id|name|language_id|chapter_id|created_at`), `sortDirection`.

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 10,
      "chapterId": 1,
      "languageId": 1,
      "name": "Linear Algebra",
      "shortIntro": "Vectors, matrices, and transformations.",
      "longIntro": "...",
      "prerequisites": "Basic arithmetic, comfort with variables.",
      "learningObjectives": "Compute determinants; solve linear systems; classify vector spaces.",
      "icon": "https://cdn.growupmore.com/chapters/translations/10/icon.webp",
      "image": "https://cdn.growupmore.com/chapters/translations/10/image.webp",
      "ogImage": "https://cdn.growupmore.com/chapters/translations/10/og-image.webp",
      "twitterImage": "https://cdn.growupmore.com/chapters/translations/10/twitter-image.webp",
      "isActive": true,
      "isDeleted": false
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

---

## 2.8 `GET /api/v1/chapters/:id/translations/:tid`

Single translation row.

---

## 2.9 `POST /api/v1/chapters/:id/translations`

Accepts **JSON** or **multipart/form-data**. Permission: `chapter.create`.

### Fields (super-set of subjects + two chapter-specific fields)

Everything in the subject translation contract ([§1.9](01%20-%20subjects.md#19)) **plus**:

| Field | Type | Notes |
|---|---|---|
| `prerequisites` | string | ≤ 5000 chars. |
| `learningObjectives` | string | ≤ 5000 chars. |

### The 3 POST upload scenarios

#### (A) POST — JSON, no images

```json
{
  "languageId": 1,
  "name": "Linear Algebra",
  "prerequisites": "Basic arithmetic.",
  "learningObjectives": "Solve linear systems."
}
```

#### (B) POST — multipart + text + all 4 image slots

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Linear Algebra` |
| `prerequisites` | text | `Basic arithmetic.` |
| `learningObjectives` | text | `Solve linear systems.` |
| `icon` | **file** | `chapter-icon-256.png` |
| `image` | **file** | `chapter-hero-512.png` |
| `ogImage` | **file** | `chapter-og-512.png` |
| `twitterImage` | **file** | `chapter-twitter-512.png` |

#### (C) POST — multipart + text + one image slot

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Linear Algebra` |
| `image` | **file** | `chapter-hero-512.png` |

### 201 CREATED — row shape as §2.7 element.

---

## 2.10 `PATCH /api/v1/chapters/:id/translations/:tid`

JSON or multipart. `hasTextChange || hasFile` required.

### The 5 PATCH scenarios

#### (1) PATCH — JSON, text only

```json
{ "name": "Linear Algebra (revised)", "prerequisites": "High-school algebra." }
```

#### (2) PATCH — multipart, text + one image

| Key | Type | Value |
|---|---|---|
| `name` | text | `Linear Algebra (revised)` |
| `icon` | **file** | `chapter-icon-v2.png` |

#### (3) PATCH — multipart, text + all 4 images

| Key | Type | Value |
|---|---|---|
| `learningObjectives` | text | `Prove Cayley–Hamilton.` |
| `icon` | **file** | `chapter-icon-v3.png` |
| `image` | **file** | `chapter-hero-v3.png` |
| `ogImage` | **file** | `chapter-og-v3.png` |
| `twitterImage` | **file** | `chapter-twitter-v3.png` |

#### (4) PATCH — multipart, single image slot, no text

| Key | Type | Value |
|---|---|---|
| `ogImage` | **file** | `chapter-og-hotfix.png` |

#### (5) PATCH — multipart, replace all 4 images, no text

| Key | Type | Value |
|---|---|---|
| `icon` | **file** | `chapter-icon-v4.png` |
| `image` | **file** | `chapter-hero-v4.png` |
| `ogImage` | **file** | `chapter-og-v4.png` |
| `twitterImage` | **file** | `chapter-twitter-v4.png` |

### 200 OK

Returns the refreshed translation row.

### Errors

Same envelope set as [subjects §1.10](01%20-%20subjects.md#110).

---

## 2.11 `DELETE /api/v1/chapters/:id/translations/:tid`

Soft-delete translation.

## 2.12 `POST /api/v1/chapters/:id/translations/:tid/restore`

Undo soft-delete.

---

## Common errors

See [subjects §Common errors](01%20-%20subjects.md#common-errors).
