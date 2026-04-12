# Phase 8 — Topics

A topic is a specific learning unit within a chapter. It represents a focused, teachable concept (e.g., "Fractions", "Linear Equations", "Photosynthesis"). Topics support translatable content (name, short intro, long intro), instructional metadata (prerequisites, learning objectives), difficulty level, estimated duration, media assets (icon, image, video), JSONB tags, and SEO/OG metadata. Topics support soft-delete and admin restore. All routes require authentication.

Permission codes: `topic.read`, `topic.create`, `topic.update`, `topic.delete`, `topic.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

Note: Translations use `topic.update` permission for all operations (not `topic.create` or `topic.delete`).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

← [back to Phase 8](./00%20-%20overview.md) · [Next →](./04%20-%20sub-topics.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31-get-apiv1topics) | `GET` | `{{baseUrl}}/api/v1/topics` | `topic.read` | List all topics with pagination, search, filter, and sort. |
| [§3.2](#32-get-apiv1topicsid) | `GET` | `{{baseUrl}}/api/v1/topics/:id` | `topic.read` | Get one topic by ID. |
| [§3.3](#33-post-apiv1topics) | `POST` | `{{baseUrl}}/api/v1/topics` | `topic.create` | Create a new topic. |
| [§3.4](#34-patch-apiv1topicsid) | `PATCH` | `{{baseUrl}}/api/v1/topics/:id` | `topic.update` | Update a topic by ID. |
| [§3.5](#35-delete-apiv1topicsid) | `DELETE` | `{{baseUrl}}/api/v1/topics/:id` | `topic.delete` | Soft-delete a topic (SA only). |
| [§3.6](#36-post-apiv1topicsidrestore) | `POST` | `{{baseUrl}}/api/v1/topics/:id/restore` | `topic.restore` | Restore a soft-deleted topic (admin+ only). |
| [§3.7](#37-get-apiv1topicsidtranslations) | `GET` | `{{baseUrl}}/api/v1/topics/:id/translations` | `topic.read` | List translations of a topic. |
| [§3.8](#38-get-apiv1topicsidtranslationstid) | `GET` | `{{baseUrl}}/api/v1/topics/:id/translations/:tid` | `topic.read` | Get one translation by ID. |
| [§3.9](#39-post-apiv1topicsidtranslations) | `POST` | `{{baseUrl}}/api/v1/topics/:id/translations` | `topic.update` | Create a new translation for a topic. |
| [§3.10](#310-patch-apiv1topicsidtranslationstid) | `PATCH` | `{{baseUrl}}/api/v1/topics/:id/translations/:tid` | `topic.update` | Update a topic translation. |
| [§3.11](#311-delete-apiv1topicsidtranslationstid) | `DELETE` | `{{baseUrl}}/api/v1/topics/:id/translations/:tid` | `topic.update` | Soft-delete a translation. |
| [§3.12](#312-post-apiv1topicsidtranslationstidrestore) | `POST` | `{{baseUrl}}/api/v1/topics/:id/translations/:tid/restore` | `topic.update` | Restore a soft-deleted translation. |

---

## 3.1 `GET /api/v1/topics`

List all topics with support for pagination, search, filtering, and sorting.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/topics` |
| Permission | `topic.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `name`, `short_intro`, `long_intro`, `prerequisites`, `learning_objectives`, `focus_keyword` (translation), `slug` (topic), `slug` (chapter), `code` (subject). |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `slug`, `difficulty_level`, `estimated_minutes`, `view_count`, `is_active`, `created_at`, `updated_at`, `name`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `chapterId` | int | — | Filter by parent chapter ID. |
| `difficultyLevel` | enum | — | `beginner`, `intermediate`, `advanced`, `expert`, `all_levels`. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted topics. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "chapterId": 1,
      "slug": "topic-fractions",
      "difficultyLevel": "beginner",
      "estimatedMinutes": 120,
      "displayOrder": 1,
      "isActive": true,
      "isDeleted": false,
      "note": "Introduction to fractions and their properties",
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-02-15T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z",
      "translations": [
        {
          "id": 1,
          "languageId": 1,
          "languageName": "English",
          "name": "Understanding Fractions",
          "shortIntro": "Learn what fractions are and how to use them",
          "longIntro": "A comprehensive guide to fractions, covering proper fractions, improper fractions, mixed numbers, and operations with fractions.",
          "prerequisites": [{"id": 1, "name": "Basic division"}],
          "learningObjectives": [{"id": 1, "objective": "Identify and classify fractions"}],
          "icon": "https://cdn.example.com/icons/fractions.webp",
          "image": "https://cdn.example.com/topics/fractions-hero.webp",
          "video": "https://cdn.example.com/videos/fractions-intro.mp4",
          "tags": ["fractions", "mathematics", "division"],
          "metaTitle": "Understanding Fractions - Learn Step by Step",
          "metaDescription": "Master fractions with our comprehensive guide covering all types and operations.",
          "metaKeywords": "fractions, mathematics, numerator, denominator",
          "canonicalUrl": "https://growupmore.com/topics/topic-fractions",
          "ogSiteName": "GrowUpMore",
          "ogTitle": "Understanding Fractions",
          "ogDescription": "Learn what fractions are and how to use them",
          "ogType": "educational_content",
          "ogImage": "https://cdn.example.com/og/fractions.webp",
          "ogUrl": "https://growupmore.com/topics/topic-fractions",
          "isActive": true,
          "isDeleted": false,
          "createdBy": 2,
          "updatedBy": 2,
          "createdAt": "2026-02-15T10:00:00.000Z",
          "updatedAt": "2026-04-10T14:30:00.000Z"
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 25, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `topic.read`

```json
{
  "success": false,
  "message": "Missing required permission: topic.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/topics` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search — `fractions` | `?searchTerm=fractions` |
| Search — `equations` | `?searchTerm=equations` |
| Search + pagination | `?pageIndex=1&pageSize=10&searchTerm=geometry` |
| Filter by chapter (id=1) | `?chapterId=1` |
| Filter by chapter + pagination | `?chapterId=1&pageIndex=1&pageSize=10` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Difficulty — beginner | `?difficultyLevel=beginner` |
| Difficulty — intermediate | `?difficultyLevel=intermediate` |
| Difficulty — advanced | `?difficultyLevel=advanced` |
| Difficulty — expert | `?difficultyLevel=expert` |
| Difficulty — all_levels | `?difficultyLevel=all_levels` |
| Sort by `display_order` ASC (default) | `?sortColumn=display_order&sortDirection=ASC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `name` DESC | `?sortColumn=name&sortDirection=DESC` |
| Sort by `slug` ASC | `?sortColumn=slug&sortDirection=ASC` |
| Sort by `difficulty_level` ASC | `?sortColumn=difficulty_level&sortDirection=ASC` |
| Sort by `estimated_minutes` DESC | `?sortColumn=estimated_minutes&sortDirection=DESC` |
| Sort by `view_count` DESC | `?sortColumn=view_count&sortDirection=DESC` |
| Sort by `created_at` DESC (newest first) | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `id` ASC | `?sortColumn=id&sortDirection=ASC` |
| Combo — topics in chapter 1, sorted by display order | `?chapterId=1&sortColumn=display_order&sortDirection=ASC` |
| Combo — active beginner topics, sorted by name | `?pageIndex=1&pageSize=50&isActive=true&difficultyLevel=beginner&sortColumn=name&sortDirection=ASC` |
| Combo — search "fractions" in chapter 1, newest first | `?chapterId=1&searchTerm=fractions&sortColumn=created_at&sortDirection=DESC` |
| Combo — deleted topics, sorted by updated_at | `?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| Combo — all topics by estimated duration (longest first) | `?sortColumn=estimated_minutes&sortDirection=DESC&pageSize=50` |
| Combo — active advanced topics, most viewed first | `?isActive=true&difficultyLevel=advanced&sortColumn=view_count&sortDirection=DESC` |

---

## 3.2 `GET /api/v1/topics/:id`

Get one topic by ID, including all translations.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/topics/:id` |
| Permission | `topic.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "chapterId": 1,
    "slug": "topic-fractions",
    "difficultyLevel": "beginner",
    "estimatedMinutes": 120,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "note": "Introduction to fractions and their properties",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-02-15T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z",
    "translations": [
      {
        "id": 1,
        "languageId": 1,
        "languageName": "English",
        "name": "Understanding Fractions",
        "shortIntro": "Learn what fractions are and how to use them",
        "longIntro": "A comprehensive guide to fractions, covering proper fractions, improper fractions, mixed numbers, and operations with fractions.",
        "prerequisites": [{"id": 1, "name": "Basic division"}],
        "learningObjectives": [{"id": 1, "objective": "Identify and classify fractions"}],
        "icon": "https://cdn.example.com/icons/fractions.webp",
        "image": "https://cdn.example.com/topics/fractions-hero.webp",
        "video": "https://cdn.example.com/videos/fractions-intro.mp4",
        "tags": ["fractions", "mathematics", "division"],
        "metaTitle": "Understanding Fractions - Learn Step by Step",
        "metaDescription": "Master fractions with our comprehensive guide covering all types and operations.",
        "metaKeywords": "fractions, mathematics, numerator, denominator",
        "canonicalUrl": "https://growupmore.com/topics/topic-fractions",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Understanding Fractions",
        "ogDescription": "Learn what fractions are and how to use them",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/fractions.webp",
        "ogUrl": "https://growupmore.com/topics/topic-fractions",
        "isActive": true,
        "isDeleted": false,
        "createdBy": 2,
        "updatedBy": 2,
        "createdAt": "2026-02-15T10:00:00.000Z",
        "updatedAt": "2026-04-10T14:30:00.000Z"
      }
    ]
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.3 `POST /api/v1/topics`

Create a new topic. The topic must belong to an existing chapter.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/topics` |
| Permission | `topic.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `chapterId` | int | yes | Foreign key to chapter. |
| `slug` | string | yes | URL-friendly slug (1–100 chars). |
| `difficultyLevel` | enum | no | `beginner`, `intermediate`, `advanced`, `expert`. |
| `estimatedMinutes` | int | no | Estimated duration in minutes (>= 0, max 2147483647). |
| `displayOrder` | int | no | Display order (-32,768 to 32,767). |
| `isActive` | bool | no | Defaults to `true`. |
| `note` | string | no | Internal notes (max 5000 chars). |

### Sample request

```json
{
  "chapterId": 1,
  "slug": "topic-decimals",
  "difficultyLevel": "intermediate",
  "estimatedMinutes": 150,
  "displayOrder": 2,
  "isActive": true,
  "note": "Decimals, place value, and decimal operations"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Topic created",
  "data": {
    "id": 2,
    "chapterId": 1,
    "slug": "topic-decimals",
    "difficultyLevel": "intermediate",
    "estimatedMinutes": 150,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "note": "Decimals, place value, and decimal operations",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T09:15:00.000Z",
    "translations": []
  }
}
```

#### 400 Bad Request — validation error

```json
{
  "success": false,
  "message": "slug is too short",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found — chapter does not exist

```json
{
  "success": false,
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.4 `PATCH /api/v1/topics/:id`

Update a topic. All fields are optional.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/topics/:id` |
| Permission | `topic.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§3.3 POST topics](#33-post-apiv1topics), but all fields optional.

### Sample request

```json
{
  "difficultyLevel": "advanced",
  "estimatedMinutes": 200
}
```

### Responses

#### 200 OK

Updated topic object.

```json
{
  "success": true,
  "message": "Topic updated",
  "data": {
    "id": 2,
    "chapterId": 1,
    "slug": "topic-decimals",
    "difficultyLevel": "advanced",
    "estimatedMinutes": 200,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "note": "Decimals, place value, and decimal operations",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T10:20:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.5 `DELETE /api/v1/topics/:id`

Soft-delete a topic. Only super-admins can delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/topics/:id` |
| Permission | `topic.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Topic deleted",
  "data": {
    "id": 2,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.6 `POST /api/v1/topics/:id/restore`

Restore a soft-deleted topic (admin+ only).

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/topics/:id/restore` |
| Permission | `topic.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Topic restored",
  "data": {
    "id": 2,
    "chapterId": 1,
    "slug": "topic-decimals",
    "difficultyLevel": "advanced",
    "estimatedMinutes": 200,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "note": "Decimals, place value, and decimal operations",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T10:20:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.7 `GET /api/v1/topics/:id/translations`

List all translations for a topic.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/topics/:id/translations` |
| Permission | `topic.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "languageId": 1,
      "languageName": "English",
      "name": "Understanding Fractions",
      "shortIntro": "Learn what fractions are and how to use them",
      "longIntro": "A comprehensive guide to fractions, covering proper fractions, improper fractions, mixed numbers, and operations with fractions.",
      "prerequisites": [{"id": 1, "name": "Basic division"}],
      "learningObjectives": [{"id": 1, "objective": "Identify and classify fractions"}],
      "icon": "https://cdn.example.com/icons/fractions.webp",
      "image": "https://cdn.example.com/topics/fractions-hero.webp",
      "video": "https://cdn.example.com/videos/fractions-intro.mp4",
      "tags": ["fractions", "mathematics", "division"],
      "metaTitle": "Understanding Fractions - Learn Step by Step",
      "metaDescription": "Master fractions with our comprehensive guide covering all types and operations.",
      "metaKeywords": "fractions, mathematics, numerator, denominator",
      "canonicalUrl": "https://growupmore.com/topics/topic-fractions",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Understanding Fractions",
      "ogDescription": "Learn what fractions are and how to use them",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/fractions.webp",
      "ogUrl": "https://growupmore.com/topics/topic-fractions",
      "isActive": true,
      "isDeleted": false,
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-02-15T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 2, "totalPages": 1 }
}
```

#### 404 Not Found — topic not found

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.8 `GET /api/v1/topics/:id/translations/:tid`

Get one translation by ID.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/topics/:id/translations/:tid` |
| Permission | `topic.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "languageId": 1,
    "languageName": "English",
    "name": "Understanding Fractions",
    "shortIntro": "Learn what fractions are and how to use them",
    "longIntro": "A comprehensive guide to fractions, covering proper fractions, improper fractions, mixed numbers, and operations with fractions.",
    "prerequisites": [{"id": 1, "name": "Basic division"}],
    "learningObjectives": [{"id": 1, "objective": "Identify and classify fractions"}],
    "icon": "https://cdn.example.com/icons/fractions.webp",
    "image": "https://cdn.example.com/topics/fractions-hero.webp",
    "video": "https://cdn.example.com/videos/fractions-intro.mp4",
    "tags": ["fractions", "mathematics", "division"],
    "metaTitle": "Understanding Fractions - Learn Step by Step",
    "metaDescription": "Master fractions with our comprehensive guide covering all types and operations.",
    "metaKeywords": "fractions, mathematics, numerator, denominator",
    "canonicalUrl": "https://growupmore.com/topics/topic-fractions",
    "ogSiteName": "GrowUpMore",
    "ogTitle": "Understanding Fractions",
    "ogDescription": "Learn what fractions are and how to use them",
    "ogType": "educational_content",
    "ogImage": "https://cdn.example.com/og/fractions.webp",
    "ogUrl": "https://growupmore.com/topics/topic-fractions",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-02-15T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.9 `POST /api/v1/topics/:id/translations`

Create a new translation for a topic. Note: uses `topic.update` permission.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/topics/:id/translations` |
| Permission | `topic.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | yes | Language ID. |
| `name` | string | yes | Translation name (1–255 chars). |
| `shortIntro` | string | no | Short introduction (max 500 chars). |
| `longIntro` | string | no | Long introduction (max 5000 chars). |
| `prerequisites` | array/object | no | JSONB array of prerequisites. |
| `learningObjectives` | array/object | no | JSONB array of learning objectives. |
| `icon` | string | no | Icon URL (max 2000 chars). |
| `image` | string | no | Hero image URL (max 2000 chars). |
| `video` | string | no | Video URL (max 2000 chars). |
| `tags` | array/object | no | JSONB tags. |
| `metaTitle` | string | no | SEO meta title (max 255 chars). |
| `metaDescription` | string | no | SEO meta description (max 500 chars). |
| `metaKeywords` | string | no | SEO keywords (max 500 chars). |
| `canonicalUrl` | string | no | Canonical URL (max 2000 chars). |
| `ogSiteName` | string | no | OG site name (max 500 chars). |
| `ogTitle` | string | no | OG title (max 255 chars). |
| `ogDescription` | string | no | OG description (max 500 chars). |
| `ogType` | string | no | OG type (max 100 chars). |
| `ogImage` | string | no | OG image URL (max 2000 chars). |
| `ogUrl` | string | no | OG URL (max 2000 chars). |

### Sample request

```json
{
  "languageId": 2,
  "name": "भिन्नों को समझना",
  "shortIntro": "जानें कि भिन्न क्या हैं और उनका उपयोग कैसे करें",
  "longIntro": "भिन्नों का एक व्यापक मार्गदर्शन, जिसमें सही भिन्न, अनुचित भिन्न, मिश्रित संख्याएं और भिन्नों के साथ संचालन शामिल हैं।",
  "prerequisites": [{"id": 1, "name": "बुनियादी विभाजन"}],
  "learningObjectives": [{"id": 1, "objective": "भिन्नों को पहचानें और वर्गीकृत करें"}],
  "icon": "https://cdn.example.com/icons/fractions-hi.webp",
  "image": "https://cdn.example.com/topics/fractions-hero-hi.webp",
  "metaTitle": "भिन्नों को समझना - चरण दर चरण सीखें"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Topic translation created",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "भिन्नों को समझना",
    "shortIntro": "जानें कि भिन्न क्या हैं और उनका उपयोग कैसे करें",
    "longIntro": "भिन्नों का एक व्यापक मार्गदर्शन, जिसमें सही भिन्न, अनुचित भिन्न, मिश्रित संख्याएं और भिन्नों के साथ संचालन शामिल हैं।",
    "prerequisites": [{"id": 1, "name": "बुनियादी विभाजन"}],
    "learningObjectives": [{"id": 1, "objective": "भिन्नों को पहचानें और वर्गीकृत करें"}],
    "icon": "https://cdn.example.com/icons/fractions-hi.webp",
    "image": "https://cdn.example.com/topics/fractions-hero-hi.webp",
    "video": null,
    "tags": null,
    "metaTitle": "भिन्नों को समझना - चरण दर चरण सीखें",
    "metaDescription": null,
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T10:30:00.000Z",
    "updatedAt": "2026-04-12T10:30:00.000Z"
  }
}
```

#### 400 Bad Request

```json
{
  "success": false,
  "message": "translation name is too short",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.10 `PATCH /api/v1/topics/:id/translations/:tid`

Update a topic translation. All fields optional. Uses `topic.update` permission.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/topics/:id/translations/:tid` |
| Permission | `topic.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§3.9 POST translations](#39-post-apiv1topicsidtranslations), all fields optional.

### Sample request

```json
{
  "shortIntro": "भिन्न क्या होते हैं और उन्हें कैसे उपयोग करते हैं",
  "learningObjectives": [{"id": 1, "objective": "भिन्नों के साथ संचालन करने में सक्षम हो"}]
}
```

### Responses

#### 200 OK

Updated translation object.

```json
{
  "success": true,
  "message": "Topic translation updated",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "भिन्नों को समझना",
    "shortIntro": "भिन्न क्या होते हैं और उन्हें कैसे उपयोग करते हैं",
    "longIntro": "भिन्नों का एक व्यापक मार्गदर्शन, जिसमें सही भिन्न, अनुचित भिन्न, मिश्रित संख्याएं और भिन्नों के साथ संचालन शामिल हैं।",
    "prerequisites": [{"id": 1, "name": "बुनियादी विभाजन"}],
    "learningObjectives": [{"id": 1, "objective": "भिन्नों के साथ संचालन करने में सक्षम हो"}],
    "icon": "https://cdn.example.com/icons/fractions-hi.webp",
    "image": "https://cdn.example.com/topics/fractions-hero-hi.webp",
    "video": null,
    "tags": null,
    "metaTitle": "भिन्नों को समझना - चरण दर चरण सीखें",
    "metaDescription": null,
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T10:30:00.000Z",
    "updatedAt": "2026-04-12T11:00:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.11 `DELETE /api/v1/topics/:id/translations/:tid`

Soft-delete a translation. Uses `topic.update` permission.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/topics/:id/translations/:tid` |
| Permission | `topic.update` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Topic translation deleted",
  "data": {
    "id": 2,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.12 `POST /api/v1/topics/:id/translations/:tid/restore`

Restore a soft-deleted translation. Uses `topic.update` permission.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/topics/:id/translations/:tid/restore` |
| Permission | `topic.update` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Topic translation restored",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "भिन्नों को समझना",
    "shortIntro": "भिन्न क्या होते हैं और उन्हें कैसे उपयोग करते हैं",
    "longIntro": "भिन्नों का एक व्यापक मार्गदर्शन, जिसमें सही भिन्न, अनुचित भिन्न, मिश्रित संख्याएं और भिन्नों के साथ संचालन शामिल हैं।",
    "prerequisites": [{"id": 1, "name": "बुनियादी विभाजन"}],
    "learningObjectives": [{"id": 1, "objective": "भिन्नों के साथ संचालन करने में सक्षम हो"}],
    "icon": "https://cdn.example.com/icons/fractions-hi.webp",
    "image": "https://cdn.example.com/topics/fractions-hero-hi.webp",
    "video": null,
    "tags": null,
    "metaTitle": "भिन्नों को समझना - चरण दर चरण सीखें",
    "metaDescription": null,
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T10:30:00.000Z",
    "updatedAt": "2026-04-12T11:00:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Topic translation 999 not found",
  "code": "NOT_FOUND"
}
```
