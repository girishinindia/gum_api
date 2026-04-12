# Phase 9 — Course Modules

A course module is a structural unit within a course that organizes lessons into cohesive learning blocks. Each module contains lessons grouped by topic, skill, or progression level. Modules support translatable content (name, introductions, descriptions), metadata such as display order and estimated duration, and media assets (icon, image, tags). Modules support soft-delete and admin restore. All routes require authentication.

Permission codes: `course_module.read`, `course_module.create`, `course_module.update`, `course_module.delete`, `course_module.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Next →](./04%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-modules) | `GET` | `{{baseUrl}}/api/v1/course-modules` | `course_module.read` | List all course modules with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1course-modulesid) | `GET` | `{{baseUrl}}/api/v1/course-modules/:id` | `course_module.read` | Get one course module by ID. |
| [§1.3](#13-post-apiv1course-modules) | `POST` | `{{baseUrl}}/api/v1/course-modules` | `course_module.create` | Create a new course module. |
| [§1.4](#14-patch-apiv1course-modulesid) | `PATCH` | `{{baseUrl}}/api/v1/course-modules/:id` | `course_module.update` | Update a course module by ID. |
| [§1.5](#15-delete-apiv1course-modulesid) | `DELETE` | `{{baseUrl}}/api/v1/course-modules/:id` | `course_module.delete` | Soft-delete a course module (SA only). |
| [§1.6](#16-post-apiv1course-modulesidrestore) | `POST` | `{{baseUrl}}/api/v1/course-modules/:id/restore` | `course_module.restore` | Restore a soft-deleted course module (admin+ only). |
| [§1.7](#17-get-apiv1course-modulesidtranslations) | `GET` | `{{baseUrl}}/api/v1/course-modules/:id/translations` | `course_module.read` | List translations of a course module. |
| [§1.8](#18-get-apiv1course-modulesidtranslationstid) | `GET` | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid` | `course_module.read` | Get one translation by ID. |
| [§1.9](#19-post-apiv1course-modulesidtranslations) | `POST` | `{{baseUrl}}/api/v1/course-modules/:id/translations` | `course_module.create` | Create a new translation for a course module. |
| [§1.10](#110-patch-apiv1course-modulesidtranslationstid) | `PATCH` | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid` | `course_module.update` | Update a course module translation. |
| [§1.11](#111-delete-apiv1course-modulesidtranslationstid) | `DELETE` | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid` | `course_module.delete` | Soft-delete a translation. |
| [§1.12](#112-post-apiv1course-modulesidtranslationstidrestore) | `POST` | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid/restore` | `course_module.restore` | Restore a soft-deleted translation. |

---

## 1.1 `GET /api/v1/course-modules`

List all course modules with support for pagination, search, filtering, and sorting.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-modules` |
| Permission | `course_module.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `name`, `short_intro`, `description`, `slug`, `course_code`. |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `slug`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `courseId` | int | — | Filter modules by parent course ID. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted modules. |

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
      "courseModuleId": 1,
      "courseId": 1,
      "courseCode": "WEB101",
      "courseSlug": "web-development",
      "moduleSlug": "getting-started",
      "moduleName": "Getting Started",
      "shortIntro": "Learn the fundamentals",
      "description": "This module covers the basics of web development",
      "languageId": 1,
      "languageCode": "en",
      "displayOrder": 1,
      "estimatedMinutes": 120,
      "viewCount": 0,
      "isActive": true,
      "createdAt": "2026-04-01T08:00:00.000Z",
      "updatedAt": "2026-04-11T10:30:00.000Z"
    },
    {
      "id": 2,
      "courseModuleId": 2,
      "courseId": 1,
      "courseCode": "WEB101",
      "courseSlug": "web-development",
      "moduleSlug": "html-basics",
      "moduleName": "HTML Basics",
      "shortIntro": "Master HTML structure",
      "description": "Learn semantic HTML5 and document structure",
      "languageId": 1,
      "languageCode": "en",
      "displayOrder": 2,
      "estimatedMinutes": 180,
      "viewCount": 0,
      "isActive": true,
      "createdAt": "2026-04-02T08:00:00.000Z",
      "updatedAt": "2026-04-11T10:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 12, "totalPages": 1 }
}
```

#### 403 Forbidden — caller lacks `course_module.read`

```json
{
  "success": false,
  "message": "Missing required permission: course_module.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/course-modules` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 1 (defaults) | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=2&pageSize=20` |
| 3 | Page 3, default size | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=3&pageSize=20` |
| 4 | Page 1, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=5` |
| 5 | Page 1, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=10` |
| 6 | Page 1, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=9999&pageSize=20` |
| 8 | Search — `getting` | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=getting` |
| 9 | Search — `html` | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=html` |
| 10 | Search — `basics` | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=basics` |
| 11 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=10&searchTerm=advanced` |
| 12 | Filter by courseId (WEB101) | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=1` |
| 13 | Filter by courseId (PYTHON101) | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=2` |
| 14 | Active modules only | `GET` | `{{baseUrl}}/api/v1/course-modules?isActive=true` |
| 15 | Inactive modules only | `GET` | `{{baseUrl}}/api/v1/course-modules?isActive=false` |
| 16 | Deleted modules only | `GET` | `{{baseUrl}}/api/v1/course-modules?isDeleted=true` |
| 17 | Non-deleted modules only | `GET` | `{{baseUrl}}/api/v1/course-modules?isDeleted=false` |
| 18 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=id&sortDirection=ASC` |
| 19 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=id&sortDirection=DESC` |
| 20 | Sort by `display_order` ASC (curriculum order) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=display_order&sortDirection=ASC` |
| 21 | Sort by `display_order` DESC (reverse order) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=display_order&sortDirection=DESC` |
| 22 | Sort by `slug` ASC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=slug&sortDirection=ASC` |
| 23 | Sort by `slug` DESC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=slug&sortDirection=DESC` |
| 24 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=created_at&sortDirection=DESC` |
| 25 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=created_at&sortDirection=ASC` |
| 26 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=updated_at&sortDirection=DESC` |
| 27 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=updated_at&sortDirection=ASC` |
| 28 | Combo — active modules of WEB101, sorted by order | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=50&courseId=1&isActive=true&sortColumn=display_order&sortDirection=ASC` |
| 29 | Combo — search "css" in WEB101 modules | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=20&courseId=1&searchTerm=css` |
| 30 | Combo — deleted modules, sorted by updated date | `GET` | `{{baseUrl}}/api/v1/course-modules?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| 31 | Combo — search, filter by course, sort by order | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=10&searchTerm=advanced&courseId=1&sortColumn=display_order&sortDirection=ASC` |
| 32 | Combo — all modules for PYTHON101, newest first | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=2&sortColumn=created_at&sortDirection=DESC` |
| 33 | Combo — active + non-deleted, paginated | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=20&isActive=true&isDeleted=false` |
| 34 | Combo — inactive modules with search | `GET` | `{{baseUrl}}/api/v1/course-modules?isActive=false&searchTerm=deprecated` |

---

## 1.2 `GET /api/v1/course-modules/:id`

Get one course module by ID, including all translations.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id` |
| Permission | `course_module.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full course module object with all translations.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseId": 1,
    "slug": "getting-started",
    "displayOrder": 1,
    "estimatedMinutes": 120,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-01T08:00:00.000Z",
    "updatedAt": "2026-04-11T10:30:00.000Z",
    "translations": [
      {
        "id": 1,
        "courseModuleId": 1,
        "languageId": 1,
        "languageName": "English",
        "name": "Getting Started",
        "shortIntro": "Learn the fundamentals",
        "description": "This module covers the basics of web development, including environment setup, tools, and essential concepts.",
        "icon": "https://cdn.example.com/icons/getting-started.webp",
        "image": "https://cdn.example.com/images/getting-started-banner.webp",
        "tags": ["fundamentals", "setup", "introduction"],
        "metaTitle": "Getting Started with Web Development",
        "metaDescription": "Learn web development fundamentals and set up your development environment",
        "metaKeywords": "web development, setup, fundamentals",
        "canonicalUrl": "https://growupmore.com/courses/web-development/getting-started",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Getting Started with Web Development",
        "ogDescription": "Master the basics of web development",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/getting-started.webp",
        "ogUrl": "https://growupmore.com/courses/web-development/getting-started",
        "twitterSite": "@growupmore",
        "twitterTitle": "Getting Started",
        "twitterDescription": "Web development fundamentals",
        "twitterImage": "https://cdn.example.com/twitter/getting-started.webp",
        "twitterCard": "summary_large_image",
        "robotsDirective": "index, follow",
        "focusKeyword": "web development fundamentals",
        "structuredData": {
          "type": "LearningResource",
          "learningResourceType": "Module"
        },
        "isActive": true,
        "isDeleted": false,
        "createdBy": 5,
        "updatedBy": 5,
        "createdAt": "2026-04-01T08:00:00.000Z",
        "updatedAt": "2026-04-11T10:30:00.000Z"
      },
      {
        "id": 2,
        "courseModuleId": 1,
        "languageId": 2,
        "languageName": "Spanish",
        "name": "Primeros Pasos",
        "shortIntro": "Aprende lo fundamental",
        "description": "Este módulo cubre los conceptos básicos del desarrollo web",
        "icon": "https://cdn.example.com/icons/getting-started.webp",
        "image": "https://cdn.example.com/images/getting-started-banner.webp",
        "tags": ["fundamentos", "configuración", "introducción"],
        "metaTitle": "Primeros Pasos en Desarrollo Web",
        "metaDescription": "Aprende los fundamentos del desarrollo web",
        "metaKeywords": "desarrollo web, configuración, fundamentos",
        "canonicalUrl": "https://growupmore.com/es/courses/web-development/getting-started",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Primeros Pasos",
        "ogDescription": "Fundamentos del desarrollo web",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/getting-started.webp",
        "ogUrl": "https://growupmore.com/es/courses/web-development/getting-started",
        "twitterSite": "@growupmore",
        "twitterTitle": "Primeros Pasos",
        "twitterDescription": "Fundamentos del desarrollo web",
        "twitterImage": "https://cdn.example.com/twitter/getting-started.webp",
        "twitterCard": "summary_large_image",
        "robotsDirective": "index, follow",
        "focusKeyword": "fundamentos del desarrollo web",
        "structuredData": {
          "type": "LearningResource",
          "learningResourceType": "Module"
        },
        "isActive": true,
        "isDeleted": false,
        "createdBy": 5,
        "updatedBy": 5,
        "createdAt": "2026-04-01T09:00:00.000Z",
        "updatedAt": "2026-04-11T10:30:00.000Z"
      }
    ]
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/course-modules`

Create a new course module. The `slug` must be unique within the course. Optionally embed a translation at creation.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-modules` |
| Permission | `course_module.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | yes | Parent course ID. |
| `slug` | string | no | URL-friendly slug (1–100 chars). Case-insensitive. Must be unique within the course. |
| `displayOrder` | int | no | Display order in course curriculum. |
| `estimatedMinutes` | int | no | Estimated duration of module in minutes. |
| `isActive` | bool | no | Defaults to `true`. |
| `translation` | object | no | Optional embedded translation (see table below). |

**Translation sub-object** (optional, all fields optional except noted):

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | yes (if translation provided) | Language ID. |
| `name` | string | yes (if translation provided) | Translation module name (1–255 chars). |
| `shortIntro` | string | no | Short introduction (max 5000 chars). |
| `description` | string | no | Module description (max 5000 chars). |
| `icon` | string | no | Icon URL (max 2000 chars). |
| `image` | string | no | Module image URL (max 2000 chars). |
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
| `twitterSite` | string | no | Twitter site handle (max 100 chars). |
| `twitterTitle` | string | no | Twitter title (max 255 chars). |
| `twitterDescription` | string | no | Twitter description (max 500 chars). |
| `twitterImage` | string | no | Twitter image URL (max 2000 chars). |
| `twitterCard` | string | no | Twitter card type (max 50 chars). |
| `robotsDirective` | string | no | Robots meta directive (max 500 chars). |
| `focusKeyword` | string | no | SEO focus keyword (max 255 chars). |
| `structuredData` | object | no | JSONB structured data. |

### Sample request

```json
{
  "courseId": 1,
  "slug": "getting-started",
  "displayOrder": 1,
  "estimatedMinutes": 120,
  "isActive": true,
  "translation": {
    "languageId": 1,
    "name": "Getting Started",
    "shortIntro": "Learn the fundamentals",
    "description": "This module covers the basics of web development, including environment setup, tools, and essential concepts.",
    "icon": "https://cdn.example.com/icons/getting-started.webp",
    "image": "https://cdn.example.com/images/getting-started-banner.webp",
    "tags": ["fundamentals", "setup", "introduction"],
    "metaTitle": "Getting Started with Web Development",
    "metaDescription": "Learn web development fundamentals and set up your development environment",
    "metaKeywords": "web development, setup, fundamentals"
  }
}
```

### Sample request without translation

```json
{
  "courseId": 1,
  "slug": "html-basics",
  "displayOrder": 2,
  "estimatedMinutes": 180,
  "isActive": true
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Course module created",
  "data": {
    "id": 1,
    "courseId": 1,
    "slug": "getting-started",
    "displayOrder": 1,
    "estimatedMinutes": 120,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T08:00:00.000Z",
    "updatedAt": "2026-04-12T08:00:00.000Z",
    "translations": [
      {
        "id": 1,
        "courseModuleId": 1,
        "languageId": 1,
        "languageName": "English",
        "name": "Getting Started",
        "shortIntro": "Learn the fundamentals",
        "description": "This module covers the basics of web development, including environment setup, tools, and essential concepts.",
        "icon": "https://cdn.example.com/icons/getting-started.webp",
        "image": "https://cdn.example.com/images/getting-started-banner.webp",
        "tags": ["fundamentals", "setup", "introduction"],
        "metaTitle": "Getting Started with Web Development",
        "metaDescription": "Learn web development fundamentals and set up your development environment",
        "metaKeywords": "web development, setup, fundamentals",
        "canonicalUrl": "https://growupmore.com/courses/web-development/getting-started",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Getting Started with Web Development",
        "ogDescription": "Learn web development fundamentals and set up your development environment",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/getting-started.webp",
        "ogUrl": "https://growupmore.com/courses/web-development/getting-started",
        "twitterSite": "@growupmore",
        "twitterTitle": "Getting Started with Web Development",
        "twitterDescription": "Learn web development fundamentals and set up your development environment",
        "twitterImage": "https://cdn.example.com/twitter/getting-started.webp",
        "twitterCard": "summary_large_image",
        "robotsDirective": "index, follow",
        "focusKeyword": "web development fundamentals",
        "structuredData": {
          "type": "LearningResource",
          "learningResourceType": "Module"
        },
        "isActive": true,
        "isDeleted": false,
        "createdBy": 5,
        "updatedBy": 5,
        "createdAt": "2026-04-12T08:00:00.000Z",
        "updatedAt": "2026-04-12T08:00:00.000Z"
      }
    ]
  }
}
```

#### 400 Bad Request — missing required `courseId`

```json
{
  "success": false,
  "message": "courseId is required",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad Request — duplicate slug within course

```json
{
  "success": false,
  "message": "Module slug 'getting-started' already exists in this course",
  "code": "DUPLICATE_SLUG"
}
```

#### 404 Not Found — parent course does not exist

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/course-modules/:id`

Update a course module. At least one field is required.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id` |
| Permission | `course_module.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `slug` | string | URL-friendly slug (1–100 chars). Case-insensitive. Must remain unique within the course. |
| `displayOrder` | int | Display order in course curriculum. |
| `estimatedMinutes` | int | Estimated duration of module in minutes. |
| `isActive` | bool | Active flag. |

### Sample request

```json
{
  "displayOrder": 2,
  "estimatedMinutes": 150,
  "isActive": true
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Course module updated",
  "data": {
    "id": 1,
    "courseId": 1,
    "slug": "getting-started",
    "displayOrder": 2,
    "estimatedMinutes": 150,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T08:00:00.000Z",
    "updatedAt": "2026-04-12T09:15:00.000Z",
    "translations": []
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field is required",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad Request — duplicate slug within course

```json
{
  "success": false,
  "message": "Module slug 'getting-started' already exists in this course",
  "code": "DUPLICATE_SLUG"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/course-modules/:id`

Soft-delete a course module. Cascades soft-delete to all translations. Super-admin only.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id` |
| Permission | `course_module.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content

Soft-deletion succeeds. No response body.

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/course-modules/:id/restore`

Restore a soft-deleted course module. Optionally restores all soft-deleted translations.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/restore` |
| Permission | `course_module.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** (optional)

| Field | Type | Notes |
|---|---|---|
| `restoreTranslations` | bool | If `true`, restores all soft-deleted translations. Defaults to `false`. |

### Sample request

```json
{
  "restoreTranslations": true
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Course module restored",
  "data": {
    "id": 1,
    "courseId": 1,
    "slug": "getting-started",
    "displayOrder": 1,
    "estimatedMinutes": 120,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T08:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.restore",
  "code": "FORBIDDEN"
}
```

---

## 1.7 `GET /api/v1/course-modules/:id/translations`

List all translations of a course module with support for pagination, search, filtering, and sorting.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/translations` |
| Permission | `course_module.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `name`, `short_intro`, `description`. |
| `sortColumn` | enum | `name` | `id`, `name`, `language_id`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `languageId` | int | — | Filter translations by language ID. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted translations. |

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
      "courseModuleId": 1,
      "languageId": 1,
      "languageName": "English",
      "name": "Getting Started",
      "shortIntro": "Learn the fundamentals",
      "description": "This module covers the basics of web development, including environment setup, tools, and essential concepts.",
      "icon": "https://cdn.example.com/icons/getting-started.webp",
      "image": "https://cdn.example.com/images/getting-started-banner.webp",
      "tags": ["fundamentals", "setup", "introduction"],
      "metaTitle": "Getting Started with Web Development",
      "metaDescription": "Learn web development fundamentals and set up your development environment",
      "metaKeywords": "web development, setup, fundamentals",
      "canonicalUrl": "https://growupmore.com/courses/web-development/getting-started",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Getting Started with Web Development",
      "ogDescription": "Learn web development fundamentals and set up your development environment",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/getting-started.webp",
      "ogUrl": "https://growupmore.com/courses/web-development/getting-started",
      "twitterSite": "@growupmore",
      "twitterTitle": "Getting Started with Web Development",
      "twitterDescription": "Learn web development fundamentals and set up your development environment",
      "twitterImage": "https://cdn.example.com/twitter/getting-started.webp",
      "twitterCard": "summary_large_image",
      "robotsDirective": "index, follow",
      "focusKeyword": "web development fundamentals",
      "structuredData": {
        "type": "LearningResource",
        "learningResourceType": "Module"
      },
      "moduleSlug": "getting-started",
      "moduleDisplayOrder": 1,
      "moduleCourseId": 1,
      "moduleCourseCode": "WEB101",
      "moduleCourseSlug": "web-development",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-01T08:00:00.000Z",
      "updatedAt": "2026-04-11T10:30:00.000Z"
    },
    {
      "id": 2,
      "courseModuleId": 1,
      "languageId": 2,
      "languageName": "Spanish",
      "name": "Primeros Pasos",
      "shortIntro": "Aprende lo fundamental",
      "description": "Este módulo cubre los conceptos básicos del desarrollo web",
      "icon": "https://cdn.example.com/icons/getting-started.webp",
      "image": "https://cdn.example.com/images/getting-started-banner.webp",
      "tags": ["fundamentos", "configuración", "introducción"],
      "metaTitle": "Primeros Pasos en Desarrollo Web",
      "metaDescription": "Aprende los fundamentos del desarrollo web",
      "metaKeywords": "desarrollo web, configuración, fundamentos",
      "canonicalUrl": "https://growupmore.com/es/courses/web-development/getting-started",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Primeros Pasos",
      "ogDescription": "Fundamentos del desarrollo web",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/getting-started.webp",
      "ogUrl": "https://growupmore.com/es/courses/web-development/getting-started",
      "twitterSite": "@growupmore",
      "twitterTitle": "Primeros Pasos",
      "twitterDescription": "Fundamentos del desarrollo web",
      "twitterImage": "https://cdn.example.com/twitter/getting-started.webp",
      "twitterCard": "summary_large_image",
      "robotsDirective": "index, follow",
      "focusKeyword": "fundamentos del desarrollo web",
      "structuredData": {
        "type": "LearningResource",
        "learningResourceType": "Module"
      },
      "moduleSlug": "getting-started",
      "moduleDisplayOrder": 1,
      "moduleCourseId": 1,
      "moduleCourseCode": "WEB101",
      "moduleCourseSlug": "web-development",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-01T09:00:00.000Z",
      "updatedAt": "2026-04-11T10:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 2, "totalPages": 1 }
}
```

#### 404 Not Found — course module does not exist

```json
{
  "success": false,
  "message": "Course module 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.read",
  "code": "FORBIDDEN"
}
```

---

## 1.8 `GET /api/v1/course-modules/:id/translations/:tid`

Get one translation by ID.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid` |
| Permission | `course_module.read` |

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
    "courseModuleId": 1,
    "languageId": 1,
    "languageName": "English",
    "name": "Getting Started",
    "shortIntro": "Learn the fundamentals",
    "description": "This module covers the basics of web development, including environment setup, tools, and essential concepts.",
    "icon": "https://cdn.example.com/icons/getting-started.webp",
    "image": "https://cdn.example.com/images/getting-started-banner.webp",
    "tags": ["fundamentals", "setup", "introduction"],
    "metaTitle": "Getting Started with Web Development",
    "metaDescription": "Learn web development fundamentals and set up your development environment",
    "metaKeywords": "web development, setup, fundamentals",
    "canonicalUrl": "https://growupmore.com/courses/web-development/getting-started",
    "ogSiteName": "GrowUpMore",
    "ogTitle": "Getting Started with Web Development",
    "ogDescription": "Learn web development fundamentals and set up your development environment",
    "ogType": "educational_content",
    "ogImage": "https://cdn.example.com/og/getting-started.webp",
    "ogUrl": "https://growupmore.com/courses/web-development/getting-started",
    "twitterSite": "@growupmore",
    "twitterTitle": "Getting Started with Web Development",
    "twitterDescription": "Learn web development fundamentals and set up your development environment",
    "twitterImage": "https://cdn.example.com/twitter/getting-started.webp",
    "twitterCard": "summary_large_image",
    "robotsDirective": "index, follow",
    "focusKeyword": "web development fundamentals",
    "structuredData": {
      "type": "LearningResource",
      "learningResourceType": "Module"
    },
    "moduleSlug": "getting-started",
    "moduleDisplayOrder": 1,
    "moduleCourseId": 1,
    "moduleCourseCode": "WEB101",
    "moduleCourseSlug": "web-development",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-01T08:00:00.000Z",
    "updatedAt": "2026-04-11T10:30:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.read",
  "code": "FORBIDDEN"
}
```

---

## 1.9 `POST /api/v1/course-modules/:id/translations`

Create a new translation for a course module.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/translations` |
| Permission | `course_module.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | yes | Language ID. |
| `name` | string | yes | Translation module name (1–255 chars). |
| `shortIntro` | string | no | Short introduction (max 5000 chars). |
| `description` | string | no | Module description (max 5000 chars). |
| `icon` | string | no | Icon URL (max 2000 chars). |
| `image` | string | no | Module image URL (max 2000 chars). |
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
| `twitterSite` | string | no | Twitter site handle (max 100 chars). |
| `twitterTitle` | string | no | Twitter title (max 255 chars). |
| `twitterDescription` | string | no | Twitter description (max 500 chars). |
| `twitterImage` | string | no | Twitter image URL (max 2000 chars). |
| `twitterCard` | string | no | Twitter card type (max 50 chars). |
| `robotsDirective` | string | no | Robots meta directive (max 500 chars). |
| `focusKeyword` | string | no | SEO focus keyword (max 255 chars). |
| `structuredData` | object | no | JSONB structured data. |

### Sample request

```json
{
  "languageId": 2,
  "name": "Primeros Pasos",
  "shortIntro": "Aprende lo fundamental",
  "description": "Este módulo cubre los conceptos básicos del desarrollo web",
  "metaTitle": "Primeros Pasos en Desarrollo Web",
  "metaDescription": "Aprende los fundamentos del desarrollo web",
  "tags": ["fundamentos", "configuración", "introducción"]
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Translation created",
  "data": {
    "id": 2,
    "courseModuleId": 1,
    "languageId": 2,
    "languageName": "Spanish",
    "name": "Primeros Pasos",
    "shortIntro": "Aprende lo fundamental",
    "description": "Este módulo cubre los conceptos básicos del desarrollo web",
    "icon": null,
    "image": null,
    "tags": ["fundamentos", "configuración", "introducción"],
    "metaTitle": "Primeros Pasos en Desarrollo Web",
    "metaDescription": "Aprende los fundamentos del desarrollo web",
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "twitterSite": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null,
    "twitterCard": null,
    "robotsDirective": null,
    "focusKeyword": null,
    "structuredData": null,
    "moduleSlug": "getting-started",
    "moduleDisplayOrder": 1,
    "moduleCourseId": 1,
    "moduleCourseCode": "WEB101",
    "moduleCourseSlug": "web-development",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T09:30:00.000Z",
    "updatedAt": "2026-04-12T09:30:00.000Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "name is required",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad Request — duplicate translation language

```json
{
  "success": false,
  "message": "Translation for language 2 already exists for this module",
  "code": "DUPLICATE_LANGUAGE"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.create",
  "code": "FORBIDDEN"
}
```

---

## 1.10 `PATCH /api/v1/course-modules/:id/translations/:tid`

Update a course module translation. At least one field is required.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid` |
| Permission | `course_module.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `name` | string | Translation module name (1–255 chars). |
| `shortIntro` | string | Short introduction (max 5000 chars). |
| `description` | string | Module description (max 5000 chars). |
| `icon` | string | Icon URL (max 2000 chars). |
| `image` | string | Module image URL (max 2000 chars). |
| `tags` | array/object | JSONB tags. |
| `metaTitle` | string | SEO meta title (max 255 chars). |
| `metaDescription` | string | SEO meta description (max 500 chars). |
| `metaKeywords` | string | SEO keywords (max 500 chars). |
| `canonicalUrl` | string | Canonical URL (max 2000 chars). |
| `ogSiteName` | string | OG site name (max 500 chars). |
| `ogTitle` | string | OG title (max 255 chars). |
| `ogDescription` | string | OG description (max 500 chars). |
| `ogType` | string | OG type (max 100 chars). |
| `ogImage` | string | OG image URL (max 2000 chars). |
| `ogUrl` | string | OG URL (max 2000 chars). |
| `twitterSite` | string | Twitter site handle (max 100 chars). |
| `twitterTitle` | string | Twitter title (max 255 chars). |
| `twitterDescription` | string | Twitter description (max 500 chars). |
| `twitterImage` | string | Twitter image URL (max 2000 chars). |
| `twitterCard` | string | Twitter card type (max 50 chars). |
| `robotsDirective` | string | Robots meta directive (max 500 chars). |
| `focusKeyword` | string | SEO focus keyword (max 255 chars). |
| `structuredData` | object | JSONB structured data. |
| `isActive` | bool | Active flag. |

### Sample request

```json
{
  "name": "Primeros Pasos (Actualizado)",
  "description": "Este módulo cubre los conceptos básicos del desarrollo web, actualizado para 2026",
  "isActive": true
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Translation updated",
  "data": {
    "id": 2,
    "courseModuleId": 1,
    "languageId": 2,
    "languageName": "Spanish",
    "name": "Primeros Pasos (Actualizado)",
    "shortIntro": "Aprende lo fundamental",
    "description": "Este módulo cubre los conceptos básicos del desarrollo web, actualizado para 2026",
    "icon": null,
    "image": null,
    "tags": ["fundamentos", "configuración", "introducción"],
    "metaTitle": "Primeros Pasos en Desarrollo Web",
    "metaDescription": "Aprende los fundamentos del desarrollo web",
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "twitterSite": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null,
    "twitterCard": null,
    "robotsDirective": null,
    "focusKeyword": null,
    "structuredData": null,
    "moduleSlug": "getting-started",
    "moduleDisplayOrder": 1,
    "moduleCourseId": 1,
    "moduleCourseCode": "WEB101",
    "moduleCourseSlug": "web-development",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T09:30:00.000Z",
    "updatedAt": "2026-04-12T10:45:00.000Z"
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field is required",
  "code": "BAD_REQUEST"
}
```

#### 404 Not Found — translation does not exist

```json
{
  "success": false,
  "message": "Translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.update",
  "code": "FORBIDDEN"
}
```

---

## 1.11 `DELETE /api/v1/course-modules/:id/translations/:tid`

Soft-delete a course module translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid` |
| Permission | `course_module.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content

Soft-deletion succeeds. No response body.

#### 404 Not Found

```json
{
  "success": false,
  "message": "Translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.12 `POST /api/v1/course-modules/:id/translations/:tid/restore`

Restore a soft-deleted course module translation.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-modules/:id/translations/:tid/restore` |
| Permission | `course_module.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Translation restored",
  "data": {
    "id": 2,
    "courseModuleId": 1,
    "languageId": 2,
    "languageName": "Spanish",
    "name": "Primeros Pasos",
    "shortIntro": "Aprende lo fundamental",
    "description": "Este módulo cubre los conceptos básicos del desarrollo web",
    "icon": null,
    "image": null,
    "tags": ["fundamentos", "configuración", "introducción"],
    "metaTitle": "Primeros Pasos en Desarrollo Web",
    "metaDescription": "Aprende los fundamentos del desarrollo web",
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "twitterSite": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null,
    "twitterCard": null,
    "robotsDirective": null,
    "focusKeyword": null,
    "structuredData": null,
    "moduleSlug": "getting-started",
    "moduleDisplayOrder": 1,
    "moduleCourseId": 1,
    "moduleCourseCode": "WEB101",
    "moduleCourseSlug": "web-development",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T09:30:00.000Z",
    "updatedAt": "2026-04-12T10:50:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module.restore",
  "code": "FORBIDDEN"
}
```

---

## Postman Collection — Saved Examples

Below are 40+ Postman saved examples covering list operations (pagination, filters, sorts, search), CRUD operations, translation sub-resource CRUD, and error cases. Each example includes the full request URL with query/body parameters.

### **Module List Examples (§1.1)**

| # | Name | Method | URL |
|---|---|---|---|
| 1 | List modules — Page 1, default size | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=20` |
| 2 | List modules — Page 2 | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=2&pageSize=20` |
| 3 | List modules — Page size 5 | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=5` |
| 4 | List modules — Page size 100 | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=100` |
| 5 | List modules — Out-of-range page | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=9999&pageSize=20` |
| 6 | Search — term "html" | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=html` |
| 7 | Search — term "advanced" | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=advanced` |
| 8 | Search — term "getting" | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=getting` |
| 9 | Search + page size 5 | `GET` | `{{baseUrl}}/api/v1/course-modules?searchTerm=development&pageSize=5` |
| 10 | Filter — courseId=1 | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=1` |
| 11 | Filter — courseId=2 | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=2` |
| 12 | Filter — isActive=true | `GET` | `{{baseUrl}}/api/v1/course-modules?isActive=true` |
| 13 | Filter — isActive=false | `GET` | `{{baseUrl}}/api/v1/course-modules?isActive=false` |
| 14 | Filter — isDeleted=true | `GET` | `{{baseUrl}}/api/v1/course-modules?isDeleted=true` |
| 15 | Filter — isDeleted=false | `GET` | `{{baseUrl}}/api/v1/course-modules?isDeleted=false` |
| 16 | Sort — display_order ASC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=display_order&sortDirection=ASC` |
| 17 | Sort — display_order DESC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=display_order&sortDirection=DESC` |
| 18 | Sort — slug ASC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=slug&sortDirection=ASC` |
| 19 | Sort — slug DESC | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=slug&sortDirection=DESC` |
| 20 | Sort — created_at DESC (newest) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=created_at&sortDirection=DESC` |
| 21 | Sort — updated_at DESC (recently modified) | `GET` | `{{baseUrl}}/api/v1/course-modules?sortColumn=updated_at&sortDirection=DESC` |
| 22 | Combo — course=1, active, by display order | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=1&isActive=true&sortColumn=display_order&sortDirection=ASC` |
| 23 | Combo — search "css" in course 1 | `GET` | `{{baseUrl}}/api/v1/course-modules?courseId=1&searchTerm=css` |
| 24 | Combo — deleted modules, sorted by update | `GET` | `{{baseUrl}}/api/v1/course-modules?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| 25 | Combo — all filters + search + sort | `GET` | `{{baseUrl}}/api/v1/course-modules?pageIndex=1&pageSize=10&courseId=1&searchTerm=advanced&isActive=true&isDeleted=false&sortColumn=display_order&sortDirection=ASC` |

### **Module CRUD Examples (§1.2–§1.6)**

| # | Name | Method | URL | Body |
|---|---|---|---|---|
| 26 | Get module by ID | `GET` | `{{baseUrl}}/api/v1/course-modules/1` | — |
| 27 | Create module (with embedded translation) | `POST` | `{{baseUrl}}/api/v1/course-modules` | See § 1.3 sample |
| 28 | Create module (no translation) | `POST` | `{{baseUrl}}/api/v1/course-modules` | `{ "courseId": 1, "slug": "html-basics", "displayOrder": 2 }` |
| 29 | Create module (minimal) | `POST` | `{{baseUrl}}/api/v1/course-modules` | `{ "courseId": 1 }` |
| 30 | Update module — change displayOrder | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | `{ "displayOrder": 3 }` |
| 31 | Update module — change slug | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | `{ "slug": "new-slug" }` |
| 32 | Update module — change estimatedMinutes | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | `{ "estimatedMinutes": 240 }` |
| 33 | Update module — toggle isActive | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | `{ "isActive": false }` |
| 34 | Update module — multiple fields | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | `{ "displayOrder": 2, "estimatedMinutes": 150, "isActive": true }` |
| 35 | Delete module (soft-delete) | `DELETE` | `{{baseUrl}}/api/v1/course-modules/1` | — |
| 36 | Restore module | `POST` | `{{baseUrl}}/api/v1/course-modules/1/restore` | `{}` |
| 37 | Restore module + translations | `POST` | `{{baseUrl}}/api/v1/course-modules/1/restore` | `{ "restoreTranslations": true }` |

### **Translation Sub-Resource Examples (§1.7–§1.12)**

| # | Name | Method | URL | Body |
|---|---|---|---|---|
| 38 | List translations of module | `GET` | `{{baseUrl}}/api/v1/course-modules/1/translations?pageIndex=1&pageSize=20` | — |
| 39 | List translations — filter by languageId | `GET` | `{{baseUrl}}/api/v1/course-modules/1/translations?languageId=1` | — |
| 40 | List translations — search term | `GET` | `{{baseUrl}}/api/v1/course-modules/1/translations?searchTerm=spanish` | — |
| 41 | List translations — sort by name | `GET` | `{{baseUrl}}/api/v1/course-modules/1/translations?sortColumn=name&sortDirection=ASC` | — |
| 42 | Get translation by ID | `GET` | `{{baseUrl}}/api/v1/course-modules/1/translations/1` | — |
| 43 | Create translation (full) | `POST` | `{{baseUrl}}/api/v1/course-modules/1/translations` | See § 1.9 sample |
| 44 | Create translation (minimal) | `POST` | `{{baseUrl}}/api/v1/course-modules/1/translations` | `{ "languageId": 2, "name": "Spanish Module Name" }` |
| 45 | Update translation — name + description | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1/translations/1` | `{ "name": "Updated Name", "description": "New description" }` |
| 46 | Update translation — metadata only | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1/translations/1` | `{ "metaTitle": "SEO Title", "metaDescription": "SEO Desc" }` |
| 47 | Update translation — toggle isActive | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1/translations/1` | `{ "isActive": false }` |
| 48 | Delete translation (soft-delete) | `DELETE` | `{{baseUrl}}/api/v1/course-modules/1/translations/1` | — |
| 49 | Restore translation | `POST` | `{{baseUrl}}/api/v1/course-modules/1/translations/1/restore` | — |

### **Error Cases**

| # | Name | Method | URL | Expected Status |
|---|---|---|---|---|
| 50 | Get module 999 (not found) | `GET` | `{{baseUrl}}/api/v1/course-modules/999` | 404 |
| 51 | Create module — missing courseId | `POST` | `{{baseUrl}}/api/v1/course-modules` | 400 |
| 52 | Create module — duplicate slug | `POST` | `{{baseUrl}}/api/v1/course-modules` | 400 |
| 53 | Create module — invalid courseId | `POST` | `{{baseUrl}}/api/v1/course-modules` | 404 |
| 54 | Update module — no fields | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | 400 |
| 55 | Update module — duplicate slug | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1` | 400 |
| 56 | Delete module 999 (not found) | `DELETE` | `{{baseUrl}}/api/v1/course-modules/999` | 404 |
| 57 | Restore module 999 (not found) | `POST` | `{{baseUrl}}/api/v1/course-modules/999/restore` | 404 |
| 58 | Create translation — missing name | `POST` | `{{baseUrl}}/api/v1/course-modules/1/translations` | 400 |
| 59 | Create translation — duplicate language | `POST` | `{{baseUrl}}/api/v1/course-modules/1/translations` | 400 |
| 60 | Update translation — no fields | `PATCH` | `{{baseUrl}}/api/v1/course-modules/1/translations/1` | 400 |
| 61 | Get translation 999 (not found) | `GET` | `{{baseUrl}}/api/v1/course-modules/1/translations/999` | 404 |
| 62 | Delete translation 999 (not found) | `DELETE` | `{{baseUrl}}/api/v1/course-modules/1/translations/999` | 404 |

---

## Notes on implementation

**Soft-delete cascade:** Deleting a course module via [§1.5](#15-delete-apiv1course-modulesid) automatically soft-deletes all associated translations. The `isDeleted` flag and `deletedAt` timestamp are set on both parent and children.

**Restore flexibility:** The [§1.6](#16-post-apiv1course-modulesid-restore) restore endpoint accepts an optional `restoreTranslations` flag. When `true`, all soft-deleted translations of that module are restored. When omitted or `false`, only the module itself is restored.

**Slug uniqueness:** Within a course, module slugs must be unique. Attempts to create or update to a slug that already exists (for a different module in the same course) return HTTP 400.

**Default sort order:** Module list [§1.1](#11-get-apiv1course-modules) defaults to `sortColumn=display_order`, which orders modules by their curriculum position. Translation list [§1.7](#17-get-apiv1course-modulesidtranslations) defaults to `sortColumn=name`.

**Translation list context:** Each translation record returned by [§1.7](#17-get-apiv1course-modulesidtranslations) and [§1.8](#18-get-apiv1course-modulesidtranslationstid) includes parent module context fields (`moduleSlug`, `moduleDisplayOrder`, `moduleCourseId`, `moduleCourseCode`, `moduleCourseSlug`) for convenience.

**Permission model:** All module endpoints require authentication. Read-only endpoints (`GET`) require `course_module.read`. Create/update endpoints require `course_module.create` or `course_module.update`. Soft-delete requires `course_module.delete` (SA only). Restore requires `course_module.restore` (admin+).

