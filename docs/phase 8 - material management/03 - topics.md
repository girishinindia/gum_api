# Phase 8 — Topics

A **Topic** is a focused lesson under a Chapter (e.g. *Vector Spaces* under *Linear Algebra*). Same shape — parent row + per-language translation with four image slots.

All routes require auth. Permission codes: `topic.read`, `topic.create`, `topic.update`, `topic.delete`, `topic.restore`.

> **Note on authorisation model**: all translation sub-resource mutations (POST / PATCH / DELETE / restore) on topic translations are gated on `topic.update` in this router — not the more granular create/delete/restore codes. `topic.read` still gates the two GET translation endpoints.

← [chapters](02%20-%20chapters.md) · **Next →** [sub-topics](04%20-%20sub-topics.md)

---

## Endpoint summary

| § | Method | Path | Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31) | `GET` | `/api/v1/topics` | `topic.read` | List topics. |
| [§3.2](#32) | `GET` | `/api/v1/topics/:id` | `topic.read` | Get one topic. |
| [§3.3](#33) | `POST` | `/api/v1/topics` | `topic.create` | Create topic. |
| [§3.4](#34) | `PATCH` | `/api/v1/topics/:id` | `topic.update` | Partial update. |
| [§3.5](#35) | `DELETE` | `/api/v1/topics/:id` | `topic.delete` | Soft-delete. |
| [§3.6](#36) | `POST` | `/api/v1/topics/:id/restore` | `topic.restore` | Undo soft-delete. |
| [§3.7](#37) | `GET` | `/api/v1/topics/:id/translations` | `topic.read` | List translations. |
| [§3.8](#38) | `GET` | `/api/v1/topics/:id/translations/:tid` | `topic.read` | Get one translation. |
| [§3.9](#39) | `POST` | `/api/v1/topics/:id/translations` | `topic.update` | Create translation — JSON or multipart. |
| [§3.10](#310) | `PATCH` | `/api/v1/topics/:id/translations/:tid` | `topic.update` | Update translation — JSON or multipart. |
| [§3.11](#311) | `DELETE` | `/api/v1/topics/:id/translations/:tid` | `topic.update` | Soft-delete translation. |
| [§3.12](#312) | `POST` | `/api/v1/topics/:id/translations/:tid/restore` | `topic.update` | Undo translation soft-delete. |

---

## 3.1 `GET /api/v1/topics`

List topics.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` / `pageSize` | int | `1` / `20` | |
| `searchTerm` | string | — | |
| `chapterId` | int | — | Filter by parent chapter. |
| `difficultyLevel` | enum | — | |
| `isActive` / `isDeleted` | bool | — | |
| `sortColumn` | enum | `display_order` | `id`, `code`, `slug`, `chapter_id`, `difficulty_level`, `estimated_hours`, `display_order`, `view_count`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | |

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "code": "MATH-ALG-VS",
      "slug": "vector-spaces",
      "chapterId": 1,
      "difficultyLevel": "intermediate",
      "estimatedHours": 3,
      "displayOrder": 1,
      "viewCount": 0,
      "isActive": true,
      "isDeleted": false
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

---

## 3.2 `GET /api/v1/topics/:id`

Single row — `404` → `Topic 9999 not found`.

---

## 3.3 `POST /api/v1/topics`

Create topic. JSON.

```json
{
  "code": "MATH-ALG-VS",
  "chapterId": 1,
  "difficultyLevel": "intermediate",
  "estimatedHours": 3,
  "displayOrder": 1,
  "isActive": true,
  "translation": {
    "languageId": 1,
    "name": "Vector Spaces",
    "shortIntro": "Axioms, subspaces, independence."
  }
}
```

Required: `code`, `chapterId`.

---

## 3.4 `PATCH /api/v1/topics/:id`

JSON partial update. Empty body → `400`.

---

## 3.5 `DELETE /api/v1/topics/:id` · 3.6 `POST /:id/restore`

Standard soft-delete / restore envelopes.

---

## 3.7 `GET /api/v1/topics/:id/translations`

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 10,
      "topicId": 1,
      "languageId": 1,
      "name": "Vector Spaces",
      "shortIntro": "Axioms, subspaces, independence.",
      "longIntro": "...",
      "videoTitle": "Intro to vector spaces",
      "videoDurationMinutes": 18,
      "icon": "https://cdn.growupmore.com/topics/translations/10/icon.webp",
      "image": "https://cdn.growupmore.com/topics/translations/10/image.webp",
      "ogImage": "https://cdn.growupmore.com/topics/translations/10/og-image.webp",
      "twitterImage": "https://cdn.growupmore.com/topics/translations/10/twitter-image.webp",
      "isActive": true,
      "isDeleted": false
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

---

## 3.8 `GET /api/v1/topics/:id/translations/:tid`

Single translation row.

---

## 3.9 `POST /api/v1/topics/:id/translations`

Accepts **JSON** or **multipart/form-data**. Permission: `topic.update`.

Fields match the subject translation set ([§1.9](01%20-%20subjects.md#19)) — Topic translations do *not* expose `prerequisites` / `learningObjectives`.

### The 3 POST upload scenarios

#### (A) POST — JSON, no images

```json
{
  "languageId": 1,
  "name": "Vector Spaces",
  "shortIntro": "Axioms, subspaces, independence."
}
```

#### (B) POST — multipart + text + all 4 image slots

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Vector Spaces` |
| `videoTitle` | text | `Intro to vector spaces` |
| `icon` | **file** | `topic-icon-256.png` |
| `image` | **file** | `topic-hero-512.png` |
| `ogImage` | **file** | `topic-og-512.png` |
| `twitterImage` | **file** | `topic-twitter-512.png` |

#### (C) POST — multipart + text + one image slot

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Vector Spaces` |
| `image` | **file** | `topic-hero-512.png` |

### 201 CREATED — row shape as §3.7 element.

---

## 3.10 `PATCH /api/v1/topics/:id/translations/:tid`

Accepts **JSON** or **multipart/form-data**. Permission: `topic.update`. `hasTextChange || hasFile` required.

### The 5 PATCH scenarios

#### (1) PATCH — JSON, text only

```json
{ "name": "Vector Spaces (revised)", "videoDurationMinutes": 20 }
```

#### (2) PATCH — multipart, text + one image

| Key | Type | Value |
|---|---|---|
| `name` | text | `Vector Spaces (revised)` |
| `icon` | **file** | `topic-icon-v2.png` |

#### (3) PATCH — multipart, text + all 4 images

| Key | Type | Value |
|---|---|---|
| `shortIntro` | text | `Cleaner intro.` |
| `icon` | **file** | `topic-icon-v3.png` |
| `image` | **file** | `topic-hero-v3.png` |
| `ogImage` | **file** | `topic-og-v3.png` |
| `twitterImage` | **file** | `topic-twitter-v3.png` |

#### (4) PATCH — multipart, single image slot, no text

| Key | Type | Value |
|---|---|---|
| `ogImage` | **file** | `topic-og-hotfix.png` |

#### (5) PATCH — multipart, replace all 4 images, no text

| Key | Type | Value |
|---|---|---|
| `icon` | **file** | `topic-icon-v4.png` |
| `image` | **file** | `topic-hero-v4.png` |
| `ogImage` | **file** | `topic-og-v4.png` |
| `twitterImage` | **file** | `topic-twitter-v4.png` |

### 200 OK — refreshed translation row.

---

## 3.11 `DELETE /:id/translations/:tid` · 3.12 `POST /:id/translations/:tid/restore`

Both gated on `topic.update` (per the router). Standard envelopes.

---

## Common errors

See [subjects §Common errors](01%20-%20subjects.md#common-errors).
