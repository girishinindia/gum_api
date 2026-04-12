# Phase 8 — Subjects

A subject is the top-level curriculum element in GrowUpMore's learning hierarchy. It represents a broad area of study (Mathematics, Science, English, Social Studies, etc.) and serves as the parent container for chapters. Each subject may have metadata such as difficulty level, estimated hours, tags, SEO/OG metadata, media assets (icon, image, video), and translatable content (name, short intro, long intro). Subjects support soft-delete and admin restore. All routes require authentication.

Permission codes: `subject.read`, `subject.create`, `subject.update`, `subject.delete`, `subject.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 8](./00%20-%20overview.md) · [Next →](./02%20-%20chapters.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1subjects) | `GET` | `{{baseUrl}}/api/v1/subjects` | `subject.read` | List all subjects with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1subjectsid) | `GET` | `{{baseUrl}}/api/v1/subjects/:id` | `subject.read` | Get one subject by ID. |
| [§1.3](#13-post-apiv1subjects) | `POST` | `{{baseUrl}}/api/v1/subjects` | `subject.create` | Create a new subject. |
| [§1.4](#14-patch-apiv1subjectsid) | `PATCH` | `{{baseUrl}}/api/v1/subjects/:id` | `subject.update` | Update a subject by ID. |
| [§1.5](#15-delete-apiv1subjectsid) | `DELETE` | `{{baseUrl}}/api/v1/subjects/:id` | `subject.delete` | Soft-delete a subject (SA only). |
| [§1.6](#16-post-apiv1subjectsidrestore) | `POST` | `{{baseUrl}}/api/v1/subjects/:id/restore` | `subject.restore` | Restore a soft-deleted subject (admin+ only). |
| [§1.7](#17-get-apiv1subjectsidtranslations) | `GET` | `{{baseUrl}}/api/v1/subjects/:id/translations` | `subject.read` | List translations of a subject. |
| [§1.8](#18-get-apiv1subjectsidtranslationstid) | `GET` | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid` | `subject.read` | Get one translation by ID. |
| [§1.9](#19-post-apiv1subjectsidtranslations) | `POST` | `{{baseUrl}}/api/v1/subjects/:id/translations` | `subject.create` | Create a new translation for a subject. |
| [§1.10](#110-patch-apiv1subjectsidtranslationstid) | `PATCH` | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid` | `subject.update` | Update a subject translation. |
| [§1.11](#111-delete-apiv1subjectsidtranslationstid) | `DELETE` | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid` | `subject.delete` | Soft-delete a translation. |
| [§1.12](#112-post-apiv1subjectsidtranslationstidrestore) | `POST` | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid/restore` | `subject.restore` | Restore a soft-deleted translation. |

---

## 1.1 `GET /api/v1/subjects`

List all subjects with support for pagination, search, filtering, and sorting.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/subjects` |
| Permission | `subject.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `name`, `short_intro`, `long_intro`, `meta_title`, `focus_keyword` (translation), `code`, `slug` (subject). |
| `sortColumn` | enum | `display_order` | `id`, `code`, `slug`, `display_order`, `difficulty_level`, `estimated_hours`, `view_count`, `is_active`, `created_at`, `updated_at`, `name`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `difficultyLevel` | enum | — | `beginner`, `intermediate`, `advanced`, `expert`, `all_levels`. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted subjects. |

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
      "code": "MATH101",
      "slug": "mathematics-fundamentals",
      "difficultyLevel": "beginner",
      "estimatedHours": 40.5,
      "displayOrder": 1,
      "isActive": true,
      "isDeleted": false,
      "note": "Foundation course for mathematics",
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z",
      "translations": [
        {
          "id": 1,
          "languageId": 1,
          "languageName": "English",
          "name": "Mathematics Fundamentals",
          "shortIntro": "Learn the basics of mathematics",
          "longIntro": "A comprehensive introduction to mathematical concepts and problem-solving techniques.",
          "icon": "https://cdn.example.com/icons/math.webp",
          "image": "https://cdn.example.com/subjects/math-hero.webp",
          "videoTitle": "Welcome to Math 101",
          "videoDescription": "Overview of the mathematics fundamentals course",
          "videoThumbnail": "https://cdn.example.com/thumbnails/math101.webp",
          "videoDurationMinutes": 5,
          "tags": ["mathematics", "fundamentals", "algebra"],
          "metaTitle": "Mathematics Fundamentals - Learn from Scratch",
          "metaDescription": "Master the foundations of mathematics with our comprehensive beginner-friendly course.",
          "metaKeywords": "mathematics, fundamentals, algebra, basics",
          "canonicalUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
          "ogSiteName": "GrowUpMore",
          "ogTitle": "Mathematics Fundamentals",
          "ogDescription": "Learn mathematics basics",
          "ogType": "educational_content",
          "ogImage": "https://cdn.example.com/og/math.webp",
          "ogUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
          "isActive": true,
          "isDeleted": false,
          "createdBy": 2,
          "updatedBy": 2,
          "createdAt": "2026-01-15T10:00:00.000Z",
          "updatedAt": "2026-04-10T14:30:00.000Z"
        },
        {
          "id": 2,
          "languageId": 2,
          "languageName": "Hindi",
          "name": "गणित के मूल सिद्धांत",
          "shortIntro": "गणित की बुनियादें सीखें",
          "longIntro": "गणितीय अवधारणाओं और समस्या-समाधान तकनीकों का एक व्यापक परिचय।",
          "icon": "https://cdn.example.com/icons/math-hi.webp",
          "image": "https://cdn.example.com/subjects/math-hero-hi.webp",
          "videoTitle": "गणित 101 में स्वागत है",
          "videoDescription": "गणित मौलिक पाठ्यक्रम का अवलोकन",
          "videoThumbnail": "https://cdn.example.com/thumbnails/math101-hi.webp",
          "videoDurationMinutes": 5,
          "tags": ["गणित", "मूल सिद्धांत", "बीजगणित"],
          "metaTitle": "गणित के मूल सिद्धांत - शुरुआत से सीखें",
          "metaDescription": "हमारे व्यापक शुरुआत-अनुकूल पाठ्यक्रम के साथ गणित की नींव में महारत हासिल करें।",
          "metaKeywords": "गणित, मूल सिद्धांत, बीजगणित, बुनियादें",
          "canonicalUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
          "ogSiteName": "GrowUpMore",
          "ogTitle": "गणित के मूल सिद्धांत",
          "ogDescription": "गणित की बुनियादें सीखें",
          "ogType": "educational_content",
          "ogImage": "https://cdn.example.com/og/math-hi.webp",
          "ogUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
          "isActive": true,
          "isDeleted": false,
          "createdBy": 2,
          "updatedBy": 2,
          "createdAt": "2026-01-15T10:05:00.000Z",
          "updatedAt": "2026-04-10T14:30:00.000Z"
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 15, "totalPages": 1 }
}
```

#### 403 Forbidden — caller lacks `subject.read`

```json
{
  "success": false,
  "message": "Missing required permission: subject.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/subjects` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search — `math` | `?searchTerm=math` |
| Search — `fundamentals` | `?searchTerm=fundamentals` |
| Search + pagination | `?pageIndex=1&pageSize=10&searchTerm=science` |
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
| Sort by `code` ASC | `?sortColumn=code&sortDirection=ASC` |
| Sort by `slug` ASC | `?sortColumn=slug&sortDirection=ASC` |
| Sort by `difficulty_level` ASC | `?sortColumn=difficulty_level&sortDirection=ASC` |
| Sort by `estimated_hours` DESC | `?sortColumn=estimated_hours&sortDirection=DESC` |
| Sort by `view_count` DESC | `?sortColumn=view_count&sortDirection=DESC` |
| Sort by `created_at` DESC (newest first) | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `id` ASC | `?sortColumn=id&sortDirection=ASC` |
| Combo — active beginner subjects, sorted by name | `?pageIndex=1&pageSize=50&isActive=true&difficultyLevel=beginner&sortColumn=name&sortDirection=ASC` |
| Combo — search "math" in active, newest first | `?pageIndex=1&pageSize=20&searchTerm=math&isActive=true&sortColumn=created_at&sortDirection=DESC` |
| Combo — deleted subjects, sorted by updated_at | `?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| Combo — advanced subjects, most viewed first | `?difficultyLevel=advanced&sortColumn=view_count&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/subjects/:id`

Get one subject by ID, including all translations.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/subjects/:id` |
| Permission | `subject.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full subject object with all translations.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "code": "MATH101",
    "slug": "mathematics-fundamentals",
    "difficultyLevel": "beginner",
    "estimatedHours": 40.5,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "note": "Foundation course for mathematics",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z",
    "translations": [
      {
        "id": 1,
        "languageId": 1,
        "languageName": "English",
        "name": "Mathematics Fundamentals",
        "shortIntro": "Learn the basics of mathematics",
        "longIntro": "A comprehensive introduction to mathematical concepts and problem-solving techniques.",
        "icon": "https://cdn.example.com/icons/math.webp",
        "image": "https://cdn.example.com/subjects/math-hero.webp",
        "videoTitle": "Welcome to Math 101",
        "videoDescription": "Overview of the mathematics fundamentals course",
        "videoThumbnail": "https://cdn.example.com/thumbnails/math101.webp",
        "videoDurationMinutes": 5,
        "tags": ["mathematics", "fundamentals", "algebra"],
        "metaTitle": "Mathematics Fundamentals - Learn from Scratch",
        "metaDescription": "Master the foundations of mathematics with our comprehensive beginner-friendly course.",
        "metaKeywords": "mathematics, fundamentals, algebra, basics",
        "canonicalUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Mathematics Fundamentals",
        "ogDescription": "Learn mathematics basics",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/math.webp",
        "ogUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
        "isActive": true,
        "isDeleted": false,
        "createdBy": 2,
        "updatedBy": 2,
        "createdAt": "2026-01-15T10:00:00.000Z",
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
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: subject.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/subjects`

Create a new subject. The `code` and `slug` must be unique.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/subjects` |
| Permission | `subject.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | Unique subject code (1–100 chars). Case-insensitive. |
| `slug` | string | yes | URL-friendly slug (1–100 chars). Case-insensitive. |
| `difficultyLevel` | enum | no | `beginner`, `intermediate`, `advanced`, `expert`, `all_levels`. |
| `estimatedHours` | number | no | Positive decimal, up to 999,999.9. |
| `displayOrder` | int | no | Display order (-32,768 to 32,767). |
| `isActive` | bool | no | Defaults to `true`. |
| `note` | string | no | Internal notes (max 5000 chars). |

### Sample request

```json
{
  "code": "SCI101",
  "slug": "science-basics",
  "difficultyLevel": "beginner",
  "estimatedHours": 50,
  "displayOrder": 2,
  "isActive": true,
  "note": "Introductory science course covering physics, chemistry, and biology basics"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Subject created",
  "data": {
    "id": 2,
    "code": "SCI101",
    "slug": "science-basics",
    "difficultyLevel": "beginner",
    "estimatedHours": 50,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "note": "Introductory science course covering physics, chemistry, and biology basics",
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
  "message": "code is too short",
  "code": "VALIDATION_ERROR"
}
```

#### 409 Conflict — duplicate code or slug

```json
{
  "success": false,
  "message": "Subject with code 'SCI101' already exists",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: subject.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/subjects/:id`

Update a subject. All fields are optional; only provided fields are updated.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/subjects/:id` |
| Permission | `subject.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

Same as [§1.3 POST /subjects](#13-post-apiv1subjects), but all fields optional.

### Sample request

```json
{
  "difficultyLevel": "intermediate",
  "estimatedHours": 55,
  "displayOrder": 3
}
```

### Responses

#### 200 OK

Updated subject object.

```json
{
  "success": true,
  "message": "Subject updated",
  "data": {
    "id": 2,
    "code": "SCI101",
    "slug": "science-basics",
    "difficultyLevel": "intermediate",
    "estimatedHours": 55,
    "displayOrder": 3,
    "isActive": true,
    "isDeleted": false,
    "note": "Introductory science course covering physics, chemistry, and biology basics",
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
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate slug or code

```json
{
  "success": false,
  "message": "Subject with code 'MATH101' already exists",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: subject.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/subjects/:id`

Soft-delete a subject. Only super-admins can delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/subjects/:id` |
| Permission | `subject.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Subject deleted",
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
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: subject.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/subjects/:id/restore`

Restore a soft-deleted subject (admin+ only).

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/restore` |
| Permission | `subject.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Subject restored",
  "data": {
    "id": 2,
    "code": "SCI101",
    "slug": "science-basics",
    "difficultyLevel": "intermediate",
    "estimatedHours": 55,
    "displayOrder": 3,
    "isActive": true,
    "isDeleted": false,
    "note": "Introductory science course covering physics, chemistry, and biology basics",
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
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: subject.restore",
  "code": "FORBIDDEN"
}
```

---

## 1.7 `GET /api/v1/subjects/:id/translations`

List all translations for a subject.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/translations` |
| Permission | `subject.read` |

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
      "name": "Mathematics Fundamentals",
      "shortIntro": "Learn the basics of mathematics",
      "longIntro": "A comprehensive introduction to mathematical concepts and problem-solving techniques.",
      "icon": "https://cdn.example.com/icons/math.webp",
      "image": "https://cdn.example.com/subjects/math-hero.webp",
      "videoTitle": "Welcome to Math 101",
      "videoDescription": "Overview of the mathematics fundamentals course",
      "videoThumbnail": "https://cdn.example.com/thumbnails/math101.webp",
      "videoDurationMinutes": 5,
      "tags": ["mathematics", "fundamentals", "algebra"],
      "metaTitle": "Mathematics Fundamentals - Learn from Scratch",
      "metaDescription": "Master the foundations of mathematics with our comprehensive beginner-friendly course.",
      "metaKeywords": "mathematics, fundamentals, algebra, basics",
      "canonicalUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Mathematics Fundamentals",
      "ogDescription": "Learn mathematics basics",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/math.webp",
      "ogUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
      "isActive": true,
      "isDeleted": false,
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 2, "totalPages": 1 }
}
```

#### 404 Not Found — subject not found

```json
{
  "success": false,
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.8 `GET /api/v1/subjects/:id/translations/:tid`

Get one translation by ID.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid` |
| Permission | `subject.read` |

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
    "name": "Mathematics Fundamentals",
    "shortIntro": "Learn the basics of mathematics",
    "longIntro": "A comprehensive introduction to mathematical concepts and problem-solving techniques.",
    "icon": "https://cdn.example.com/icons/math.webp",
    "image": "https://cdn.example.com/subjects/math-hero.webp",
    "videoTitle": "Welcome to Math 101",
    "videoDescription": "Overview of the mathematics fundamentals course",
    "videoThumbnail": "https://cdn.example.com/thumbnails/math101.webp",
    "videoDurationMinutes": 5,
    "tags": ["mathematics", "fundamentals", "algebra"],
    "metaTitle": "Mathematics Fundamentals - Learn from Scratch",
    "metaDescription": "Master the foundations of mathematics with our comprehensive beginner-friendly course.",
    "metaKeywords": "mathematics, fundamentals, algebra, basics",
    "canonicalUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
    "ogSiteName": "GrowUpMore",
    "ogTitle": "Mathematics Fundamentals",
    "ogDescription": "Learn mathematics basics",
    "ogType": "educational_content",
    "ogImage": "https://cdn.example.com/og/math.webp",
    "ogUrl": "https://growupmore.com/subjects/mathematics-fundamentals",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Subject translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.9 `POST /api/v1/subjects/:id/translations`

Create a new translation for a subject.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/translations` |
| Permission | `subject.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | yes | Language ID (must exist in `languages` table). |
| `name` | string | yes | Translation name (1–255 chars). |
| `shortIntro` | string | no | Short introduction (max 5000 chars). |
| `longIntro` | string | no | Long introduction (max 5000 chars). |
| `icon` | string | no | Icon URL (max 2000 chars). |
| `image` | string | no | Hero image URL (max 2000 chars). |
| `videoTitle` | string | no | Video title (max 500 chars). |
| `videoDescription` | string | no | Video description (max 500 chars). |
| `videoThumbnail` | string | no | Video thumbnail URL (max 2000 chars). |
| `videoDurationMinutes` | number | no | Video duration in minutes. |
| `tags` | array/object | no | JSONB tags. |
| `metaTitle` | string | no | SEO meta title (max 255 chars). |
| `metaDescription` | string | no | SEO meta description (max 500 chars). |
| `metaKeywords` | string | no | SEO keywords (max 500 chars). |
| `canonicalUrl` | string | no | Canonical URL (max 2000 chars). |
| `ogSiteName` | string | no | Open Graph site name (max 500 chars). |
| `ogTitle` | string | no | OG title (max 255 chars). |
| `ogDescription` | string | no | OG description (max 500 chars). |
| `ogType` | string | no | OG type (max 100 chars). |
| `ogImage` | string | no | OG image URL (max 2000 chars). |
| `ogUrl` | string | no | OG URL (max 2000 chars). |

### Sample request

```json
{
  "languageId": 2,
  "name": "गणित की मूल बातें",
  "shortIntro": "गणित की बुनियादें सीखें",
  "longIntro": "गणितीय अवधारणाओं और समस्या-समाधान तकनीकों का एक व्यापक परिचय।",
  "icon": "https://cdn.example.com/icons/math-hi.webp",
  "image": "https://cdn.example.com/subjects/math-hero-hi.webp",
  "videoTitle": "गणित 101 में स्वागत है",
  "metaTitle": "गणित की मूल बातें - शुरुआत से सीखें",
  "metaDescription": "हमारे व्यापक शुरुआत-अनुकूल पाठ्यक्रम के साथ गणित की नींव में महारत हासिल करें।"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Subject translation created",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "गणित की मूल बातें",
    "shortIntro": "गणित की बुनियादें सीखें",
    "longIntro": "गणितीय अवधारणाओं और समस्या-समाधान तकनीकों का एक व्यापक परिचय।",
    "icon": "https://cdn.example.com/icons/math-hi.webp",
    "image": "https://cdn.example.com/subjects/math-hero-hi.webp",
    "videoTitle": "गणित 101 में स्वागत है",
    "videoDescription": null,
    "videoThumbnail": null,
    "videoDurationMinutes": null,
    "tags": null,
    "metaTitle": "गणित की मूल बातें - शुरुआत से सीखें",
    "metaDescription": "हमारे व्यापक शुरुआत-अनुकूल पाठ्यक्रम के साथ गणित की नींव में महारत हासिल करें।",
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
  "message": "Subject 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.10 `PATCH /api/v1/subjects/:id/translations/:tid`

Update a subject translation. All fields optional.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid` |
| Permission | `subject.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§1.9 POST translations](#19-post-apiv1subjectsidtranslations), all fields optional.

### Sample request

```json
{
  "shortIntro": "गणित की आधारभूत अवधारणाएं सीखें",
  "videoDurationMinutes": 6
}
```

### Responses

#### 200 OK

Updated translation object.

```json
{
  "success": true,
  "message": "Subject translation updated",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "गणित की मूल बातें",
    "shortIntro": "गणित की आधारभूत अवधारणाएं सीखें",
    "longIntro": "गणितीय अवधारणाओं और समस्या-समाधान तकनीकों का एक व्यापक परिचय।",
    "icon": "https://cdn.example.com/icons/math-hi.webp",
    "image": "https://cdn.example.com/subjects/math-hero-hi.webp",
    "videoTitle": "गणित 101 में स्वागत है",
    "videoDescription": null,
    "videoThumbnail": null,
    "videoDurationMinutes": 6,
    "tags": null,
    "metaTitle": "गणित की मूल बातें - शुरुआत से सीखें",
    "metaDescription": "हमारे व्यापक शुरुआत-अनुकूल पाठ्यक्रम के साथ गणित की नींव में महारत हासिल करें।",
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
  "message": "Subject translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.11 `DELETE /api/v1/subjects/:id/translations/:tid`

Soft-delete a translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid` |
| Permission | `subject.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Subject translation deleted",
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
  "message": "Subject translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.12 `POST /api/v1/subjects/:id/translations/:tid/restore`

Restore a soft-deleted translation.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/subjects/:id/translations/:tid/restore` |
| Permission | `subject.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Subject translation restored",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "गणित की मूल बातें",
    "shortIntro": "गणित की आधारभूत अवधारणाएं सीखें",
    "longIntro": "गणितीय अवधारणाओं और समस्या-समाधान तकनीकों का एक व्यापक परिचय।",
    "icon": "https://cdn.example.com/icons/math-hi.webp",
    "image": "https://cdn.example.com/subjects/math-hero-hi.webp",
    "videoTitle": "गणित 101 में स्वागत है",
    "videoDescription": null,
    "videoThumbnail": null,
    "videoDurationMinutes": 6,
    "tags": null,
    "metaTitle": "गणित की मूल बातें - शुरुआत से सीखें",
    "metaDescription": "हमारे व्यापक शुरुआत-अनुकूल पाठ्यक्रम के साथ गणित की नींव में महारत हासिल करें।",
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
  "message": "Subject translation 999 not found",
  "code": "NOT_FOUND"
}
```
