# Phase 8 — Sub-topics

A **Sub-topic** is the atomic teaching unit under a Topic (e.g. *Basis and Dimension* under *Vector Spaces*). Parent row + per-language translation with four image slots and a per-language `pageUrl` (the canonical content page the sub-topic renders at).

All routes require auth. Permission codes: `sub_topic.read`, `sub_topic.create`, `sub_topic.update`, `sub_topic.delete`, `sub_topic.restore`.

← [topics](03%20-%20topics.md)

---

## Endpoint summary

| § | Method | Path | Permission | Purpose |
|---|---|---|---|---|
| [§4.1](#41) | `GET` | `/api/v1/sub-topics` | `sub_topic.read` | List sub-topics. |
| [§4.2](#42) | `GET` | `/api/v1/sub-topics/:id` | `sub_topic.read` | Get one sub-topic. |
| [§4.3](#43) | `POST` | `/api/v1/sub-topics` | `sub_topic.create` | Create sub-topic. |
| [§4.4](#44) | `PATCH` | `/api/v1/sub-topics/:id` | `sub_topic.update` | Partial update (JSON only). |
| [§4.5](#45) | `DELETE` | `/api/v1/sub-topics/:id` | `sub_topic.delete` | Soft-delete. |
| [§4.6](#46) | `POST` | `/api/v1/sub-topics/:id/restore` | `sub_topic.restore` | Undo soft-delete. |
| [§4.7](#47) | `GET` | `/api/v1/sub-topics/:id/translations` | `sub_topic.read` | List translations. |
| [§4.8](#48) | `GET` | `/api/v1/sub-topics/:id/translations/:tid` | `sub_topic.read` | Get one translation. |
| [§4.9](#49) | `POST` | `/api/v1/sub-topics/:id/translations` | `sub_topic.create` | Create translation — JSON or multipart (+ images). |
| [§4.10](#410) | `PATCH` | `/api/v1/sub-topics/:id/translations/:tid` | `sub_topic.update` | Update translation — JSON or multipart. |
| [§4.11](#411) | `DELETE` | `/api/v1/sub-topics/:id/translations/:tid` | `sub_topic.delete` | Soft-delete translation. |
| [§4.12](#412) | `POST` | `/api/v1/sub-topics/:id/translations/:tid/restore` | `sub_topic.restore` | Undo soft-delete. |

---

## 4.1 `GET /api/v1/sub-topics`

List sub-topics.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` / `pageSize` | int | `1` / `20` | |
| `searchTerm` | string | — | |
| `topicId` | int | — | Filter by parent topic. |
| `difficultyLevel` | enum | — | |
| `isActive` / `isDeleted` | bool | — | |
| `sortColumn` | enum | `display_order` | `id`, `code`, `slug`, `topic_id`, `difficulty_level`, `estimated_hours`, `display_order`, `view_count`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | |

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "code": "MATH-ALG-VS-BASIS",
      "slug": "basis-and-dimension",
      "topicId": 1,
      "difficultyLevel": "intermediate",
      "estimatedHours": 0.75,
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

## 4.2 `GET /api/v1/sub-topics/:id`

Single row — `404 — Sub-topic 9999 not found`.

---

## 4.3 `POST /api/v1/sub-topics`

Create sub-topic. JSON.

```json
{
  "code": "MATH-ALG-VS-BASIS",
  "topicId": 1,
  "difficultyLevel": "intermediate",
  "estimatedHours": 0.75,
  "displayOrder": 1,
  "isActive": true,
  "translation": {
    "languageId": 1,
    "name": "Basis and Dimension",
    "pageUrl": "/courses/math/linear-algebra/vector-spaces/basis-and-dimension",
    "shortIntro": "Definition of basis; dimension theorem."
  }
}
```

Required: `code`, `topicId`.

---

## 4.4 `PATCH /api/v1/sub-topics/:id`

JSON partial update. Empty body → `400`.

---

## 4.5 `DELETE /api/v1/sub-topics/:id` · 4.6 `POST /:id/restore`

Standard envelopes.

---

## 4.7 `GET /api/v1/sub-topics/:id/translations`

### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 10,
      "subTopicId": 1,
      "languageId": 1,
      "name": "Basis and Dimension",
      "pageUrl": "/courses/math/linear-algebra/vector-spaces/basis-and-dimension",
      "shortIntro": "Definition of basis; dimension theorem.",
      "longIntro": "...",
      "icon": "https://cdn.growupmore.com/sub-topics/translations/10/icon.webp",
      "image": "https://cdn.growupmore.com/sub-topics/translations/10/image.webp",
      "ogImage": "https://cdn.growupmore.com/sub-topics/translations/10/og-image.webp",
      "twitterImage": "https://cdn.growupmore.com/sub-topics/translations/10/twitter-image.webp",
      "isActive": true,
      "isDeleted": false
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

---

## 4.8 `GET /api/v1/sub-topics/:id/translations/:tid`

Single translation row.

---

## 4.9 `POST /api/v1/sub-topics/:id/translations`

Accepts **JSON** or **multipart/form-data**. Permission: `sub_topic.create`.

Fields match the subject translation set ([§1.9](01%20-%20subjects.md#19)) **plus**:

| Field | Type | Notes |
|---|---|---|
| `pageUrl` | string | ≤ 2000 chars — public URL path the sub-topic renders at. |

### The 3 POST upload scenarios

#### (A) POST — JSON, no images

```json
{
  "languageId": 1,
  "name": "Basis and Dimension",
  "pageUrl": "/courses/math/linear-algebra/vector-spaces/basis-and-dimension",
  "shortIntro": "Definition of basis; dimension theorem."
}
```

#### (B) POST — multipart + text + all 4 image slots

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Basis and Dimension` |
| `pageUrl` | text | `/courses/math/linear-algebra/vector-spaces/basis-and-dimension` |
| `icon` | **file** | `st-icon-256.png` |
| `image` | **file** | `st-hero-512.png` |
| `ogImage` | **file** | `st-og-512.png` |
| `twitterImage` | **file** | `st-twitter-512.png` |

#### (C) POST — multipart + text + one image slot

| Key | Type | Value |
|---|---|---|
| `languageId` | text | `1` |
| `name` | text | `Basis and Dimension` |
| `image` | **file** | `st-hero-512.png` |

### 201 CREATED — row shape as §4.7 element.

---

## 4.10 `PATCH /api/v1/sub-topics/:id/translations/:tid`

Accepts **JSON** or **multipart/form-data**. Permission: `sub_topic.update`. `hasTextChange || hasFile` required.

### The 5 PATCH scenarios

#### (1) PATCH — JSON, text only

```json
{ "name": "Basis and Dimension (revised)", "shortIntro": "Clearer framing." }
```

#### (2) PATCH — multipart, text + one image

| Key | Type | Value |
|---|---|---|
| `name` | text | `Basis and Dimension (revised)` |
| `icon` | **file** | `st-icon-v2.png` |

#### (3) PATCH — multipart, text + all 4 images

| Key | Type | Value |
|---|---|---|
| `shortIntro` | text | `Cleaner intro.` |
| `pageUrl` | text | `/courses/math/linear-algebra/vector-spaces/basis-and-dimension-v2` |
| `icon` | **file** | `st-icon-v3.png` |
| `image` | **file** | `st-hero-v3.png` |
| `ogImage` | **file** | `st-og-v3.png` |
| `twitterImage` | **file** | `st-twitter-v3.png` |

#### (4) PATCH — multipart, single image slot, no text

| Key | Type | Value |
|---|---|---|
| `ogImage` | **file** | `st-og-hotfix.png` |

#### (5) PATCH — multipart, replace all 4 images, no text

| Key | Type | Value |
|---|---|---|
| `icon` | **file** | `st-icon-v4.png` |
| `image` | **file** | `st-hero-v4.png` |
| `ogImage` | **file** | `st-og-v4.png` |
| `twitterImage` | **file** | `st-twitter-v4.png` |

### 200 OK — refreshed translation row.

---

## 4.11 `DELETE /:id/translations/:tid` · 4.12 `POST /:id/translations/:tid/restore`

Standard envelopes.

---

## Common errors

See [subjects §Common errors](01%20-%20subjects.md#common-errors).
