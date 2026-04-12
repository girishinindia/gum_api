# Phase 8 — Chapters

A chapter is a subdivision of a subject, representing a major topic or unit within a course. Each chapter belongs to exactly one subject and serves as the parent container for topics. Chapters support translatable content (name, short intro, long intro), instructional metadata (prerequisites, learning objectives), estimated duration, difficulty level, media assets, and SEO/OG metadata. Chapters support soft-delete and admin restore. All routes require authentication.

Permission codes: `chapter.read`, `chapter.create`, `chapter.update`, `chapter.delete`, `chapter.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

← [back to Phase 8](./00%20-%20overview.md) · [Next →](./03%20-%20topics.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21-get-apiv1chapters) | `GET` | `{{baseUrl}}/api/v1/chapters` | `chapter.read` | List all chapters with pagination, search, filter, and sort. |
| [§2.2](#22-get-apiv1chaptersid) | `GET` | `{{baseUrl}}/api/v1/chapters/:id` | `chapter.read` | Get one chapter by ID. |
| [§2.3](#23-post-apiv1chapters) | `POST` | `{{baseUrl}}/api/v1/chapters` | `chapter.create` | Create a new chapter. |
| [§2.4](#24-patch-apiv1chaptersid) | `PATCH` | `{{baseUrl}}/api/v1/chapters/:id` | `chapter.update` | Update a chapter by ID. |
| [§2.5](#25-delete-apiv1chaptersid) | `DELETE` | `{{baseUrl}}/api/v1/chapters/:id` | `chapter.delete` | Soft-delete a chapter (SA only). |
| [§2.6](#26-post-apiv1chaptersidrestore) | `POST` | `{{baseUrl}}/api/v1/chapters/:id/restore` | `chapter.restore` | Restore a soft-deleted chapter (admin+ only). |
| [§2.7](#27-get-apiv1chaptersidtranslations) | `GET` | `{{baseUrl}}/api/v1/chapters/:id/translations` | `chapter.read` | List translations of a chapter. |
| [§2.8](#28-get-apiv1chaptersidtranslationstid) | `GET` | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid` | `chapter.read` | Get one translation by ID. |
| [§2.9](#29-post-apiv1chaptersidtranslations) | `POST` | `{{baseUrl}}/api/v1/chapters/:id/translations` | `chapter.create` | Create a new translation for a chapter. |
| [§2.10](#210-patch-apiv1chaptersidtranslationstid) | `PATCH` | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid` | `chapter.update` | Update a chapter translation. |
| [§2.11](#211-delete-apiv1chaptersidtranslationstid) | `DELETE` | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid` | `chapter.delete` | Soft-delete a translation. |
| [§2.12](#212-post-apiv1chaptersidtranslationstidrestore) | `POST` | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid/restore` | `chapter.restore` | Restore a soft-deleted translation. |

---

## 2.1 `GET /api/v1/chapters`

List all chapters with support for pagination, search, filtering, and sorting.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/chapters` |
| Permission | `chapter.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `name`, `short_intro`, `long_intro`, `prerequisites`, `learning_objectives`, `focus_keyword` (translation), `slug` (chapter), `code`, `slug` (subject). |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `slug`, `difficulty_level`, `estimated_minutes`, `view_count`, `is_active`, `created_at`, `updated_at`, `name`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `subjectId` | int | — | Filter by parent subject ID. |
| `difficultyLevel` | enum | — | `beginner`, `intermediate`, `advanced`, `expert`, `all_levels`. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted chapters. |

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
      "subjectId": 1,
      "slug": "chapter-01-numbers",
      "difficultyLevel": "beginner",
      "estimatedMinutes": 180,
      "displayOrder": 1,
      "isActive": true,
      "isDeleted": false,
      "note": "Introduction to number systems and basic arithmetic",
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z",
      "translations": [
        {
          "id": 1,
          "languageId": 1,
          "languageName": "English",
          "name": "Chapter 1: Numbers and Systems",
          "shortIntro": "Understand numbers and their systems",
          "longIntro": "A deep dive into the number system, covering natural numbers, whole numbers, integers, and rational numbers.",
          "prerequisites": "Basic counting skills",
          "learningObjectives": "Students will be able to classify numbers and perform basic operations",
          "icon": "https://cdn.example.com/icons/chapter1.webp",
          "image": "https://cdn.example.com/chapters/ch1-hero.webp",
          "video": "https://cdn.example.com/videos/chapter1.mp4",
          "tags": ["numbers", "arithmetic", "fundamentals"],
          "author": "Dr. Rajesh Kumar",
          "metaTitle": "Chapter 1: Numbers and Systems",
          "metaDescription": "Learn about number systems and fundamental arithmetic concepts.",
          "metaKeywords": "numbers, systems, arithmetic, math",
          "canonicalUrl": "https://growupmore.com/chapters/chapter-01-numbers",
          "ogSiteName": "GrowUpMore",
          "ogTitle": "Chapter 1: Numbers and Systems",
          "ogDescription": "Understand numbers and their systems",
          "ogType": "educational_content",
          "ogImage": "https://cdn.example.com/og/ch1.webp",
          "ogUrl": "https://growupmore.com/chapters/chapter-01-numbers",
          "isActive": true,
          "isDeleted": false,
          "createdBy": 2,
          "updatedBy": 2,
          "createdAt": "2026-02-01T10:00:00.000Z",
          "updatedAt": "2026-04-10T14:30:00.000Z"
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 8, "totalPages": 1 }
}
```

#### 403 Forbidden — caller lacks `chapter.read`

```json
{
  "success": false,
  "message": "Missing required permission: chapter.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/chapters` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search — `numbers` | `?searchTerm=numbers` |
| Search — `arithmetic` | `?searchTerm=arithmetic` |
| Search + pagination | `?pageIndex=1&pageSize=10&searchTerm=algebra` |
| Filter by subject (id=1) | `?subjectId=1` |
| Filter by subject + pagination | `?subjectId=1&pageIndex=1&pageSize=10` |
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
| Combo — chapters in subject 1, sorted by display order | `?subjectId=1&sortColumn=display_order&sortDirection=ASC` |
| Combo — active beginner chapters, sorted by name | `?pageIndex=1&pageSize=50&isActive=true&difficultyLevel=beginner&sortColumn=name&sortDirection=ASC` |
| Combo — search "intro" in subject 1, newest first | `?subjectId=1&searchTerm=intro&sortColumn=created_at&sortDirection=DESC` |
| Combo — deleted chapters, sorted by updated_at | `?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| Combo — all chapters by estimated duration (longest first) | `?sortColumn=estimated_minutes&sortDirection=DESC&pageSize=50` |

---

## 2.2 `GET /api/v1/chapters/:id`

Get one chapter by ID, including all translations.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/chapters/:id` |
| Permission | `chapter.read` |

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
    "subjectId": 1,
    "slug": "chapter-01-numbers",
    "difficultyLevel": "beginner",
    "estimatedMinutes": 180,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "note": "Introduction to number systems and basic arithmetic",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-02-01T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z",
    "translations": [
      {
        "id": 1,
        "languageId": 1,
        "languageName": "English",
        "name": "Chapter 1: Numbers and Systems",
        "shortIntro": "Understand numbers and their systems",
        "longIntro": "A deep dive into the number system, covering natural numbers, whole numbers, integers, and rational numbers.",
        "prerequisites": "Basic counting skills",
        "learningObjectives": "Students will be able to classify numbers and perform basic operations",
        "icon": "https://cdn.example.com/icons/chapter1.webp",
        "image": "https://cdn.example.com/chapters/ch1-hero.webp",
        "video": "https://cdn.example.com/videos/chapter1.mp4",
        "tags": ["numbers", "arithmetic", "fundamentals"],
        "author": "Dr. Rajesh Kumar",
        "metaTitle": "Chapter 1: Numbers and Systems",
        "metaDescription": "Learn about number systems and fundamental arithmetic concepts.",
        "metaKeywords": "numbers, systems, arithmetic, math",
        "canonicalUrl": "https://growupmore.com/chapters/chapter-01-numbers",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Chapter 1: Numbers and Systems",
        "ogDescription": "Understand numbers and their systems",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/ch1.webp",
        "ogUrl": "https://growupmore.com/chapters/chapter-01-numbers",
        "isActive": true,
        "isDeleted": false,
        "createdBy": 2,
        "updatedBy": 2,
        "createdAt": "2026-02-01T10:00:00.000Z",
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
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.3 `POST /api/v1/chapters`

Create a new chapter. The chapter must belong to an existing subject.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/chapters` |
| Permission | `chapter.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `subjectId` | int | yes | Foreign key to subject. |
| `slug` | string | yes | URL-friendly slug (1–100 chars). |
| `difficultyLevel` | string | no | e.g., "beginner", "intermediate", "advanced". |
| `estimatedMinutes` | int | no | Estimated duration in minutes (>= 0). |
| `displayOrder` | int | no | Display order (-32,768 to 32,767). |
| `isActive` | bool | no | Defaults to `true`. |
| `note` | string | no | Internal notes (max 5000 chars). |

### Sample request

```json
{
  "subjectId": 1,
  "slug": "chapter-02-operations",
  "difficultyLevel": "beginner",
  "estimatedMinutes": 240,
  "displayOrder": 2,
  "isActive": true,
  "note": "Basic arithmetic operations and properties"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Chapter created",
  "data": {
    "id": 2,
    "subjectId": 1,
    "slug": "chapter-02-operations",
    "difficultyLevel": "beginner",
    "estimatedMinutes": 240,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "note": "Basic arithmetic operations and properties",
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
  "message": "subject_id must be a positive integer",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found — subject does not exist

```json
{
  "success": false,
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.4 `PATCH /api/v1/chapters/:id`

Update a chapter. All fields are optional; at least one field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/chapters/:id` |
| Permission | `chapter.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§2.3 POST chapters](#23-post-apiv1chapters), but all fields optional. At least one field must be provided.

### Sample request

```json
{
  "difficultyLevel": "intermediate",
  "estimatedMinutes": 300,
  "displayOrder": 3
}
```

### Responses

#### 200 OK

Updated chapter object.

```json
{
  "success": true,
  "message": "Chapter updated",
  "data": {
    "id": 2,
    "subjectId": 1,
    "slug": "chapter-02-operations",
    "difficultyLevel": "intermediate",
    "estimatedMinutes": 300,
    "displayOrder": 3,
    "isActive": true,
    "isDeleted": false,
    "note": "Basic arithmetic operations and properties",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T10:20:00.000Z",
    "translations": []
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "Provide at least one field to update",
  "code": "BAD_REQUEST"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.5 `DELETE /api/v1/chapters/:id`

Soft-delete a chapter. Only super-admins can delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/chapters/:id` |
| Permission | `chapter.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Chapter deleted",
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
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.6 `POST /api/v1/chapters/:id/restore`

Restore a soft-deleted chapter (admin+ only).

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/restore` |
| Permission | `chapter.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Chapter restored",
  "data": {
    "id": 2,
    "subjectId": 1,
    "slug": "chapter-02-operations",
    "difficultyLevel": "intermediate",
    "estimatedMinutes": 300,
    "displayOrder": 3,
    "isActive": true,
    "isDeleted": false,
    "note": "Basic arithmetic operations and properties",
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
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.7 `GET /api/v1/chapters/:id/translations`

List all translations for a chapter.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/translations` |
| Permission | `chapter.read` |

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
      "name": "Chapter 1: Numbers and Systems",
      "shortIntro": "Understand numbers and their systems",
      "longIntro": "A deep dive into the number system, covering natural numbers, whole numbers, integers, and rational numbers.",
      "prerequisites": "Basic counting skills",
      "learningObjectives": "Students will be able to classify numbers and perform basic operations",
      "icon": "https://cdn.example.com/icons/chapter1.webp",
      "image": "https://cdn.example.com/chapters/ch1-hero.webp",
      "video": "https://cdn.example.com/videos/chapter1.mp4",
      "tags": ["numbers", "arithmetic", "fundamentals"],
      "author": "Dr. Rajesh Kumar",
      "metaTitle": "Chapter 1: Numbers and Systems",
      "metaDescription": "Learn about number systems and fundamental arithmetic concepts.",
      "metaKeywords": "numbers, systems, arithmetic, math",
      "canonicalUrl": "https://growupmore.com/chapters/chapter-01-numbers",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Chapter 1: Numbers and Systems",
      "ogDescription": "Understand numbers and their systems",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/ch1.webp",
      "ogUrl": "https://growupmore.com/chapters/chapter-01-numbers",
      "isActive": true,
      "isDeleted": false,
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 404 Not Found — chapter not found

```json
{
  "success": false,
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.8 `GET /api/v1/chapters/:id/translations/:tid`

Get one translation by ID.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid` |
| Permission | `chapter.read` |

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
    "name": "Chapter 1: Numbers and Systems",
    "shortIntro": "Understand numbers and their systems",
    "longIntro": "A deep dive into the number system, covering natural numbers, whole numbers, integers, and rational numbers.",
    "prerequisites": "Basic counting skills",
    "learningObjectives": "Students will be able to classify numbers and perform basic operations",
    "icon": "https://cdn.example.com/icons/chapter1.webp",
    "image": "https://cdn.example.com/chapters/ch1-hero.webp",
    "video": "https://cdn.example.com/videos/chapter1.mp4",
    "tags": ["numbers", "arithmetic", "fundamentals"],
    "author": "Dr. Rajesh Kumar",
    "metaTitle": "Chapter 1: Numbers and Systems",
    "metaDescription": "Learn about number systems and fundamental arithmetic concepts.",
    "metaKeywords": "numbers, systems, arithmetic, math",
    "canonicalUrl": "https://growupmore.com/chapters/chapter-01-numbers",
    "ogSiteName": "GrowUpMore",
    "ogTitle": "Chapter 1: Numbers and Systems",
    "ogDescription": "Understand numbers and their systems",
    "ogType": "educational_content",
    "ogImage": "https://cdn.example.com/og/ch1.webp",
    "ogUrl": "https://growupmore.com/chapters/chapter-01-numbers",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-02-01T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Chapter translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.9 `POST /api/v1/chapters/:id/translations`

Create a new translation for a chapter.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/translations` |
| Permission | `chapter.create` |

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
| `shortIntro` | string | no | Short introduction (max 1000 chars). |
| `longIntro` | string | no | Long introduction (max 5000 chars). |
| `prerequisites` | string | no | Prerequisites text. |
| `learningObjectives` | string | no | Learning objectives text. |
| `icon` | string | no | Icon URL (max 2000 chars). |
| `image` | string | no | Hero image URL (max 2000 chars). |
| `video` | string | no | Video URL (max 2000 chars). |
| `tags` | array/object | no | JSONB tags. |
| `author` | string | no | Author name (max 255 chars). |
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
  "name": "अध्याय 1: संख्याएं और प्रणालियां",
  "shortIntro": "संख्याओं और उनकी प्रणालियों को समझें",
  "longIntro": "संख्या प्रणाली में एक गहरी खोज, जिसमें प्राकृतिक संख्याएं, पूरी संख्याएं, पूर्णांक और परिमेय संख्याएं शामिल हैं।",
  "prerequisites": "बुनियादी गणना कौशल",
  "learningObjectives": "छात्र संख्याओं को वर्गीकृत करने और बुनियादी संचालन करने में सक्षम होंगे",
  "icon": "https://cdn.example.com/icons/chapter1-hi.webp",
  "image": "https://cdn.example.com/chapters/ch1-hero-hi.webp",
  "author": "डॉ. राजेश कुमार",
  "metaTitle": "अध्याय 1: संख्याएं और प्रणालियां"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Chapter translation created",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "अध्याय 1: संख्याएं और प्रणालियां",
    "shortIntro": "संख्याओं और उनकी प्रणालियों को समझें",
    "longIntro": "संख्या प्रणाली में एक गहरी खोज, जिसमें प्राकृतिक संख्याएं, पूरी संख्याएं, पूर्णांक और परिमेय संख्याएं शामिल हैं।",
    "prerequisites": "बुनियादी गणना कौशल",
    "learningObjectives": "छात्र संख्याओं को वर्गीकृत करने और बुनियादी संचालन करने में सक्षम होंगे",
    "icon": "https://cdn.example.com/icons/chapter1-hi.webp",
    "image": "https://cdn.example.com/chapters/ch1-hero-hi.webp",
    "video": null,
    "tags": null,
    "author": "डॉ. राजेश कुमार",
    "metaTitle": "अध्याय 1: संख्याएं और प्रणालियां",
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
  "message": "Chapter 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.10 `PATCH /api/v1/chapters/:id/translations/:tid`

Update a chapter translation. All fields optional.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid` |
| Permission | `chapter.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§2.9 POST translations](#29-post-apiv1chaptersidtranslations), all fields optional.

### Sample request

```json
{
  "shortIntro": "संख्याओं की मौलिक अवधारणाएं समझें",
  "learningObjectives": "छात्र विभिन्न संख्या प्रणालियों में कुशल होंगे"
}
```

### Responses

#### 200 OK

Updated translation object.

```json
{
  "success": true,
  "message": "Chapter translation updated",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "अध्याय 1: संख्याएं और प्रणालियां",
    "shortIntro": "संख्याओं की मौलिक अवधारणाएं समझें",
    "longIntro": "संख्या प्रणाली में एक गहरी खोज, जिसमें प्राकृतिक संख्याएं, पूरी संख्याएं, पूर्णांक और परिमेय संख्याएं शामिल हैं।",
    "prerequisites": "बुनियादी गणना कौशल",
    "learningObjectives": "छात्र विभिन्न संख्या प्रणालियों में कुशल होंगे",
    "icon": "https://cdn.example.com/icons/chapter1-hi.webp",
    "image": "https://cdn.example.com/chapters/ch1-hero-hi.webp",
    "video": null,
    "tags": null,
    "author": "डॉ. राजेश कुमार",
    "metaTitle": "अध्याय 1: संख्याएं और प्रणालियां",
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
  "message": "Chapter translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.11 `DELETE /api/v1/chapters/:id/translations/:tid`

Soft-delete a translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid` |
| Permission | `chapter.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Chapter translation deleted",
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
  "message": "Chapter translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.12 `POST /api/v1/chapters/:id/translations/:tid/restore`

Restore a soft-deleted translation.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/chapters/:id/translations/:tid/restore` |
| Permission | `chapter.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Chapter translation restored",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "अध्याय 1: संख्याएं और प्रणालियां",
    "shortIntro": "संख्याओं की मौलिक अवधारणाएं समझें",
    "longIntro": "संख्या प्रणाली में एक गहरी खोज, जिसमें प्राकृतिक संख्याएं, पूरी संख्याएं, पूर्णांक और परिमेय संख्याएं शामिल हैं।",
    "prerequisites": "बुनियादी गणना कौशल",
    "learningObjectives": "छात्र विभिन्न संख्या प्रणालियों में कुशल होंगे",
    "icon": "https://cdn.example.com/icons/chapter1-hi.webp",
    "image": "https://cdn.example.com/chapters/ch1-hero-hi.webp",
    "video": null,
    "tags": null,
    "author": "डॉ. राजेश कुमार",
    "metaTitle": "अध्याय 1: संख्याएं और प्रणालियां",
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
  "message": "Chapter translation 999 not found",
  "code": "NOT_FOUND"
}
```
