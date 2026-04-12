# Phase 8 — Sub-Topics

A sub-topic is the most granular learning unit in GrowUpMore's curriculum hierarchy, representing a specific learning element within a topic. Each sub-topic belongs to exactly one topic and may have a unique page URL. Sub-topics support translatable content (name, short intro, long intro), metadata (difficulty level, estimated duration, display order), media assets (icon, image, video), JSONB tags, author attribution, and SEO/OG metadata. Sub-topics support soft-delete and admin restore. All routes require authentication.

Permission codes: `sub_topic.read`, `sub_topic.create`, `sub_topic.update`, `sub_topic.delete`, `sub_topic.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

← [back to Phase 8](./00%20-%20overview.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§4.1](#41-get-apiv1sub-topics) | `GET` | `{{baseUrl}}/api/v1/sub-topics` | `sub_topic.read` | List all sub-topics with pagination, search, filter, and sort. |
| [§4.2](#42-get-apiv1sub-topicsid) | `GET` | `{{baseUrl}}/api/v1/sub-topics/:id` | `sub_topic.read` | Get one sub-topic by ID. |
| [§4.3](#43-post-apiv1sub-topics) | `POST` | `{{baseUrl}}/api/v1/sub-topics` | `sub_topic.create` | Create a new sub-topic. |
| [§4.4](#44-patch-apiv1sub-topicsid) | `PATCH` | `{{baseUrl}}/api/v1/sub-topics/:id` | `sub_topic.update` | Update a sub-topic by ID. |
| [§4.5](#45-delete-apiv1sub-topicsid) | `DELETE` | `{{baseUrl}}/api/v1/sub-topics/:id` | `sub_topic.delete` | Soft-delete a sub-topic (SA only). |
| [§4.6](#46-post-apiv1sub-topicsidrestore) | `POST` | `{{baseUrl}}/api/v1/sub-topics/:id/restore` | `sub_topic.restore` | Restore a soft-deleted sub-topic (admin+ only). |
| [§4.7](#47-get-apiv1sub-topicsidtranslations) | `GET` | `{{baseUrl}}/api/v1/sub-topics/:id/translations` | `sub_topic.read` | List translations of a sub-topic. |
| [§4.8](#48-get-apiv1sub-topicsidtranslationstid) | `GET` | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid` | `sub_topic.read` | Get one translation by ID. |
| [§4.9](#49-post-apiv1sub-topicsidtranslations) | `POST` | `{{baseUrl}}/api/v1/sub-topics/:id/translations` | `sub_topic.create` | Create a new translation for a sub-topic. |
| [§4.10](#410-patch-apiv1sub-topicsidtranslationstid) | `PATCH` | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid` | `sub_topic.update` | Update a sub-topic translation. |
| [§4.11](#411-delete-apiv1sub-topicsidtranslationstid) | `DELETE` | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid` | `sub_topic.delete` | Soft-delete a translation. |
| [§4.12](#412-post-apiv1sub-topicsidtranslationstidrestore) | `POST` | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid/restore` | `sub_topic.restore` | Restore a soft-deleted translation. |

---

## 4.1 `GET /api/v1/sub-topics`

List all sub-topics with support for pagination, search, filtering, and sorting.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/sub-topics` |
| Permission | `sub_topic.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `name`, `short_intro`, `long_intro`, `focus_keyword` (translation), `slug` (sub-topic), `slug` (topic), `slug` (chapter), `code` (subject). |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `slug`, `difficulty_level`, `estimated_minutes`, `view_count`, `is_active`, `created_at`, `updated_at`, `name`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `topicId` | int | — | Filter by parent topic ID. |
| `difficultyLevel` | enum | — | `beginner`, `intermediate`, `advanced`, `expert`, `all_levels`. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted sub-topics. |

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
      "topicId": 1,
      "slug": "proper-fractions",
      "difficultyLevel": "BEGINNER",
      "estimatedMinutes": 45,
      "displayOrder": 1,
      "isActive": true,
      "isDeleted": false,
      "note": "Understanding proper fractions and their properties",
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-02-20T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z",
      "translations": [
        {
          "id": 1,
          "languageId": 1,
          "languageName": "English",
          "name": "Proper Fractions",
          "shortIntro": "Learn about proper fractions where numerator is less than denominator",
          "longIntro": "Proper fractions are an essential concept in mathematics. This sub-topic covers the definition, properties, and practical applications of proper fractions.",
          "icon": "https://cdn.example.com/icons/proper-fractions.webp",
          "image": "https://cdn.example.com/sub-topics/proper-fractions-hero.webp",
          "video": "https://cdn.example.com/videos/proper-fractions.mp4",
          "tags": ["fractions", "proper", "numerator", "denominator"],
          "pageUrl": "https://growupmore.com/learn/proper-fractions",
          "author": "Dr. Priya Sharma",
          "metaTitle": "Proper Fractions - Definition and Examples",
          "metaDescription": "Master proper fractions with clear explanations and practical examples.",
          "metaKeywords": "proper fractions, numerator, denominator, mathematics",
          "canonicalUrl": "https://growupmore.com/learn/proper-fractions",
          "ogSiteName": "GrowUpMore",
          "ogTitle": "Proper Fractions",
          "ogDescription": "Learn about proper fractions where numerator is less than denominator",
          "ogType": "educational_content",
          "ogImage": "https://cdn.example.com/og/proper-fractions.webp",
          "ogUrl": "https://growupmore.com/learn/proper-fractions",
          "isActive": true,
          "isDeleted": false,
          "createdBy": 2,
          "updatedBy": 2,
          "createdAt": "2026-02-20T10:00:00.000Z",
          "updatedAt": "2026-04-10T14:30:00.000Z"
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 42, "totalPages": 3 }
}
```

#### 403 Forbidden — caller lacks `sub_topic.read`

```json
{
  "success": false,
  "message": "Missing required permission: sub_topic.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/sub-topics` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search — `fractions` | `?searchTerm=fractions` |
| Search — `denominator` | `?searchTerm=denominator` |
| Search + pagination | `?pageIndex=1&pageSize=10&searchTerm=proper` |
| Filter by topic (id=1) | `?topicId=1` |
| Filter by topic + pagination | `?topicId=1&pageIndex=1&pageSize=10` |
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
| Combo — sub-topics in topic 1, sorted by display order | `?topicId=1&sortColumn=display_order&sortDirection=ASC` |
| Combo — active beginner sub-topics, sorted by name | `?pageIndex=1&pageSize=50&isActive=true&difficultyLevel=beginner&sortColumn=name&sortDirection=ASC` |
| Combo — search "proper" in topic 1, newest first | `?topicId=1&searchTerm=proper&sortColumn=created_at&sortDirection=DESC` |
| Combo — deleted sub-topics, sorted by updated_at | `?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| Combo — all sub-topics by estimated duration (longest first) | `?sortColumn=estimated_minutes&sortDirection=DESC&pageSize=50` |
| Combo — active advanced sub-topics, most viewed first | `?isActive=true&difficultyLevel=advanced&sortColumn=view_count&sortDirection=DESC` |

---

## 4.2 `GET /api/v1/sub-topics/:id`

Get one sub-topic by ID, including all translations.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id` |
| Permission | `sub_topic.read` |

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
    "topicId": 1,
    "slug": "proper-fractions",
    "difficultyLevel": "BEGINNER",
    "estimatedMinutes": 45,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "note": "Understanding proper fractions and their properties",
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-02-20T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z",
    "translations": [
      {
        "id": 1,
        "languageId": 1,
        "languageName": "English",
        "name": "Proper Fractions",
        "shortIntro": "Learn about proper fractions where numerator is less than denominator",
        "longIntro": "Proper fractions are an essential concept in mathematics. This sub-topic covers the definition, properties, and practical applications of proper fractions.",
        "icon": "https://cdn.example.com/icons/proper-fractions.webp",
        "image": "https://cdn.example.com/sub-topics/proper-fractions-hero.webp",
        "video": "https://cdn.example.com/videos/proper-fractions.mp4",
        "tags": ["fractions", "proper", "numerator", "denominator"],
        "pageUrl": "https://growupmore.com/learn/proper-fractions",
        "author": "Dr. Priya Sharma",
        "metaTitle": "Proper Fractions - Definition and Examples",
        "metaDescription": "Master proper fractions with clear explanations and practical examples.",
        "metaKeywords": "proper fractions, numerator, denominator, mathematics",
        "canonicalUrl": "https://growupmore.com/learn/proper-fractions",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Proper Fractions",
        "ogDescription": "Learn about proper fractions where numerator is less than denominator",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/proper-fractions.webp",
        "ogUrl": "https://growupmore.com/learn/proper-fractions",
        "isActive": true,
        "isDeleted": false,
        "createdBy": 2,
        "updatedBy": 2,
        "createdAt": "2026-02-20T10:00:00.000Z",
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
  "message": "Sub-topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.3 `POST /api/v1/sub-topics`

Create a new sub-topic. The sub-topic must belong to an existing topic.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/sub-topics` |
| Permission | `sub_topic.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | int | yes | Foreign key to topic. |
| `slug` | string | no | URL-friendly slug (1–100 chars). |
| `difficultyLevel` | enum | no | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`. |
| `estimatedMinutes` | int | no | Estimated duration in minutes (>= 1, max 2147483647). |
| `displayOrder` | int | no | Display order (-32,768 to 32,767). |
| `isActive` | bool | no | Defaults to `true`. |
| `note` | string | no | Internal notes (max 5000 chars). |

### Sample request

```json
{
  "topicId": 1,
  "slug": "improper-fractions",
  "difficultyLevel": "INTERMEDIATE",
  "estimatedMinutes": 60,
  "displayOrder": 2,
  "isActive": true,
  "note": "Improper fractions and mixed number conversion"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Sub-topic created",
  "data": {
    "id": 2,
    "topicId": 1,
    "slug": "improper-fractions",
    "difficultyLevel": "INTERMEDIATE",
    "estimatedMinutes": 60,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "note": "Improper fractions and mixed number conversion",
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

#### 404 Not Found — topic does not exist

```json
{
  "success": false,
  "message": "Topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.4 `PATCH /api/v1/sub-topics/:id`

Update a sub-topic. All fields are optional; at least one field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id` |
| Permission | `sub_topic.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§4.3 POST sub-topics](#43-post-apiv1sub-topics), but all fields optional. At least one field must be provided.

### Sample request

```json
{
  "difficultyLevel": "ADVANCED",
  "estimatedMinutes": 90,
  "displayOrder": 3
}
```

### Responses

#### 200 OK

Updated sub-topic object.

```json
{
  "success": true,
  "message": "Sub-topic updated",
  "data": {
    "id": 2,
    "topicId": 1,
    "slug": "improper-fractions",
    "difficultyLevel": "ADVANCED",
    "estimatedMinutes": 90,
    "displayOrder": 3,
    "isActive": true,
    "isDeleted": false,
    "note": "Improper fractions and mixed number conversion",
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
  "message": "Sub-topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.5 `DELETE /api/v1/sub-topics/:id`

Soft-delete a sub-topic. Only super-admins can delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id` |
| Permission | `sub_topic.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Sub-topic deleted",
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
  "message": "Sub-topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.6 `POST /api/v1/sub-topics/:id/restore`

Restore a soft-deleted sub-topic (admin+ only).

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/restore` |
| Permission | `sub_topic.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Sub-topic restored",
  "data": {
    "id": 2,
    "topicId": 1,
    "slug": "improper-fractions",
    "difficultyLevel": "ADVANCED",
    "estimatedMinutes": 90,
    "displayOrder": 3,
    "isActive": true,
    "isDeleted": false,
    "note": "Improper fractions and mixed number conversion",
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
  "message": "Sub-topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.7 `GET /api/v1/sub-topics/:id/translations`

List all translations for a sub-topic.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/translations` |
| Permission | `sub_topic.read` |

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
      "name": "Proper Fractions",
      "shortIntro": "Learn about proper fractions where numerator is less than denominator",
      "longIntro": "Proper fractions are an essential concept in mathematics. This sub-topic covers the definition, properties, and practical applications of proper fractions.",
      "icon": "https://cdn.example.com/icons/proper-fractions.webp",
      "image": "https://cdn.example.com/sub-topics/proper-fractions-hero.webp",
      "video": "https://cdn.example.com/videos/proper-fractions.mp4",
      "tags": ["fractions", "proper", "numerator", "denominator"],
      "pageUrl": "https://growupmore.com/learn/proper-fractions",
      "author": "Dr. Priya Sharma",
      "metaTitle": "Proper Fractions - Definition and Examples",
      "metaDescription": "Master proper fractions with clear explanations and practical examples.",
      "metaKeywords": "proper fractions, numerator, denominator, mathematics",
      "canonicalUrl": "https://growupmore.com/learn/proper-fractions",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Proper Fractions",
      "ogDescription": "Learn about proper fractions where numerator is less than denominator",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/proper-fractions.webp",
      "ogUrl": "https://growupmore.com/learn/proper-fractions",
      "isActive": true,
      "isDeleted": false,
      "createdBy": 2,
      "updatedBy": 2,
      "createdAt": "2026-02-20T10:00:00.000Z",
      "updatedAt": "2026-04-10T14:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 2, "totalPages": 1 }
}
```

#### 404 Not Found — sub-topic not found

```json
{
  "success": false,
  "message": "Sub-topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.8 `GET /api/v1/sub-topics/:id/translations/:tid`

Get one translation by ID.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid` |
| Permission | `sub_topic.read` |

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
    "name": "Proper Fractions",
    "shortIntro": "Learn about proper fractions where numerator is less than denominator",
    "longIntro": "Proper fractions are an essential concept in mathematics. This sub-topic covers the definition, properties, and practical applications of proper fractions.",
    "icon": "https://cdn.example.com/icons/proper-fractions.webp",
    "image": "https://cdn.example.com/sub-topics/proper-fractions-hero.webp",
    "video": "https://cdn.example.com/videos/proper-fractions.mp4",
    "tags": ["fractions", "proper", "numerator", "denominator"],
    "pageUrl": "https://growupmore.com/learn/proper-fractions",
    "author": "Dr. Priya Sharma",
    "metaTitle": "Proper Fractions - Definition and Examples",
    "metaDescription": "Master proper fractions with clear explanations and practical examples.",
    "metaKeywords": "proper fractions, numerator, denominator, mathematics",
    "canonicalUrl": "https://growupmore.com/learn/proper-fractions",
    "ogSiteName": "GrowUpMore",
    "ogTitle": "Proper Fractions",
    "ogDescription": "Learn about proper fractions where numerator is less than denominator",
    "ogType": "educational_content",
    "ogImage": "https://cdn.example.com/og/proper-fractions.webp",
    "ogUrl": "https://growupmore.com/learn/proper-fractions",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 2,
    "updatedBy": 2,
    "createdAt": "2026-02-20T10:00:00.000Z",
    "updatedAt": "2026-04-10T14:30:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Sub-topic translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.9 `POST /api/v1/sub-topics/:id/translations`

Create a new translation for a sub-topic.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/translations` |
| Permission | `sub_topic.create` |

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
| `shortIntro` | string | no | Short introduction (max 5000 chars). |
| `longIntro` | string | no | Long introduction (max 5000 chars). |
| `icon` | string | no | Icon URL (max 2000 chars). |
| `image` | string | no | Hero image URL (max 2000 chars). |
| `video` | string | no | Video URL (max 2000 chars). |
| `tags` | array/object | no | JSONB tags. |
| `pageUrl` | string | no | Page URL (max 2000 chars). |
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
  "name": "सही भिन्न",
  "shortIntro": "जानें कि सही भिन्न क्या हैं जहां अंश हर से कम है",
  "longIntro": "सही भिन्न गणित की एक आवश्यक अवधारणा है। यह उप-विषय सही भिन्नों की परिभाषा, गुण और व्यावहारिक अनुप्रयोगों को कवर करता है।",
  "icon": "https://cdn.example.com/icons/proper-fractions-hi.webp",
  "image": "https://cdn.example.com/sub-topics/proper-fractions-hero-hi.webp",
  "author": "डॉ. प्रिया शर्मा",
  "pageUrl": "https://growupmore.com/learn/proper-fractions-hi",
  "metaTitle": "सही भिन्न - परिभाषा और उदाहरण"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Sub-topic translation created",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "सही भिन्न",
    "shortIntro": "जानें कि सही भिन्न क्या हैं जहां अंश हर से कम है",
    "longIntro": "सही भिन्न गणित की एक आवश्यक अवधारणा है। यह उप-विषय सही भिन्नों की परिभाषा, गुण और व्यावहारिक अनुप्रयोगों को कवर करता है।",
    "icon": "https://cdn.example.com/icons/proper-fractions-hi.webp",
    "image": "https://cdn.example.com/sub-topics/proper-fractions-hero-hi.webp",
    "video": null,
    "tags": null,
    "pageUrl": "https://growupmore.com/learn/proper-fractions-hi",
    "author": "डॉ. प्रिया शर्मा",
    "metaTitle": "सही भिन्न - परिभाषा और उदाहरण",
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
  "message": "Sub-topic 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.10 `PATCH /api/v1/sub-topics/:id/translations/:tid`

Update a sub-topic translation. All fields optional.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid` |
| Permission | `sub_topic.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — same as [§4.9 POST translations](#49-post-apiv1sub-topicsidtranslations), all fields optional.

### Sample request

```json
{
  "shortIntro": "सही भिन्न जहां अंश हर से कम हो",
  "author": "डॉ. प्रिया शर्मा, संस्करण 2.0"
}
```

### Responses

#### 200 OK

Updated translation object.

```json
{
  "success": true,
  "message": "Sub-topic translation updated",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "सही भिन्न",
    "shortIntro": "सही भिन्न जहां अंश हर से कम हो",
    "longIntro": "सही भिन्न गणित की एक आवश्यक अवधारणा है। यह उप-विषय सही भिन्नों की परिभाषा, गुण और व्यावहारिक अनुप्रयोगों को कवर करता है।",
    "icon": "https://cdn.example.com/icons/proper-fractions-hi.webp",
    "image": "https://cdn.example.com/sub-topics/proper-fractions-hero-hi.webp",
    "video": null,
    "tags": null,
    "pageUrl": "https://growupmore.com/learn/proper-fractions-hi",
    "author": "डॉ. प्रिया शर्मा, संस्करण 2.0",
    "metaTitle": "सही भिन्न - परिभाषा और उदाहरण",
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
  "message": "Sub-topic translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.11 `DELETE /api/v1/sub-topics/:id/translations/:tid`

Soft-delete a translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid` |
| Permission | `sub_topic.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Sub-topic translation deleted",
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
  "message": "Sub-topic translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 4.12 `POST /api/v1/sub-topics/:id/translations/:tid/restore`

Restore a soft-deleted translation.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/sub-topics/:id/translations/:tid/restore` |
| Permission | `sub_topic.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Sub-topic translation restored",
  "data": {
    "id": 2,
    "languageId": 2,
    "languageName": "Hindi",
    "name": "सही भिन्न",
    "shortIntro": "सही भिन्न जहां अंश हर से कम हो",
    "longIntro": "सही भिन्न गणित की एक आवश्यक अवधारणा है। यह उप-विषय सही भिन्नों की परिभाषा, गुण और व्यावहारिक अनुप्रयोगों को कवर करता है।",
    "icon": "https://cdn.example.com/icons/proper-fractions-hi.webp",
    "image": "https://cdn.example.com/sub-topics/proper-fractions-hero-hi.webp",
    "video": null,
    "tags": null,
    "pageUrl": "https://growupmore.com/learn/proper-fractions-hi",
    "author": "डॉ. प्रिया शर्मा, संस्करण 2.0",
    "metaTitle": "सही भिन्न - परिभाषा और उदाहरण",
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
  "message": "Sub-topic translation 999 not found",
  "code": "NOT_FOUND"
}
```
