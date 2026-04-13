# Phase 12 — Webinars

Webinars are standalone or course-linked live sessions on the Grow Up More platform. Each webinar can be system-owned or instructor-owned, optionally linked to a course and/or chapter, and supports scheduling, meeting details (Zoom, Google Meet, Teams, custom), pricing (free or paid), capacity management, recording URLs, and status tracking. Webinars support multilingual translations with full SEO metadata (Open Graph, Twitter Card, structured data). Webinars support soft-delete with cascade to translations and admin restore.

Permission codes: `webinar.read`, `webinar.create`, `webinar.update`, `webinar.delete`, `webinar.restore`, `webinar_translation.read`, `webinar_translation.create`, `webinar_translation.update`, `webinar_translation.delete`, `webinar_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `webinar.delete` and `webinar_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1webinars) | `GET` | `/api/v1/webinars` | `webinar.read` | List webinars with pagination, search, filter, sort. |
| [§1.2](#12-get-apiv1webinarsid) | `GET` | `/api/v1/webinars/:id` | `webinar.read` | Get one webinar by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1webinars) | `POST` | `/api/v1/webinars` | `webinar.create` | Create a new webinar. |
| [§1.4](#14-patch-apiv1webinarsid) | `PATCH` | `/api/v1/webinars/:id` | `webinar.update` | Update a webinar. |
| [§1.5](#15-delete-apiv1webinarsid) | `DELETE` | `/api/v1/webinars/:id` | `webinar.delete` | Soft-delete (cascades to translations). |
| [§1.6](#16-post-apiv1webinarsidrestore) | `POST` | `/api/v1/webinars/:id/restore` | `webinar.restore` | Restore a soft-deleted webinar (cascades). |
| [§2.1](#21-get-apiv1webinarsidtranslations) | `GET` | `/api/v1/webinars/:id/translations` | `webinar_translation.read` | List translations of a webinar. |
| [§2.2](#22-get-apiv1webinarsidtranslationstid) | `GET` | `/api/v1/webinars/:id/translations/:tid` | `webinar_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1webinarsidtranslations) | `POST` | `/api/v1/webinars/:id/translations` | `webinar_translation.create` | Create a translation. |
| [§2.4](#24-patch-apiv1webinarsidtranslationstid) | `PATCH` | `/api/v1/webinars/:id/translations/:tid` | `webinar_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1webinarsidtranslationstid) | `DELETE` | `/api/v1/webinars/:id/translations/:tid` | `webinar_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1webinarsidtranslationstidrestore) | `POST` | `/api/v1/webinars/:id/translations/:tid/restore` | `webinar_translation.restore` | Restore a soft-deleted translation. |

---

## Enums reference

**webinar_owner**: `system`, `instructor`

**webinar_status**: `scheduled`, `live`, `completed`, `cancelled`

**meeting_platform**: `zoom`, `google_meet`, `teams`, `custom`

### Owner-FK constraint

| webinar_owner | instructor_id |
|---|---|
| `system` | Must be `null` |
| `instructor` | Must be provided (valid, non-deleted user) |

---

## 1.1 `GET /api/v1/webinars`

List all webinars with their translation context.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `languageId` | int | — | Filter by language (e.g., `1` for English). |
| `webinarOwner` | enum | — | `system`, `instructor`. |
| `webinarStatus` | enum | — | `scheduled`, `live`, `completed`, `cancelled`. |
| `meetingPlatform` | enum | — | `zoom`, `google_meet`, `teams`, `custom`. |
| `isFree` | bool | — | Filter free/paid webinars. |
| `courseId` | int | — | Filter by course. |
| `chapterId` | int | — | Filter by chapter. |
| `instructorId` | int | — | Filter by instructor. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted webinars. |
| `searchTerm` | string | — | Searches title, description, short_description, code, slug, focus_keyword. |
| `sortColumn` | enum | `webinar_scheduled_at` | See **Sort columns** below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

`webinar_scheduled_at`, `webinar_trans_title`, `webinar_trans_created_at`, `webinar_trans_updated_at`, `webinar_created_at`, `webinar_updated_at`, `webinar_price`, `webinar_display_order`, `webinar_registered_count`, `webinar_duration_minutes`, `webinar_code`, `webinar_slug`, `webinar_owner`, `webinar_webinar_status`, `webinar_meeting_platform`.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "webinarOwner": "system",
      "instructorId": null,
      "instructorFirstName": null,
      "instructorLastName": null,
      "instructorEmail": null,
      "courseId": null,
      "chapterId": null,
      "code": "WEB_INTRO_001",
      "slug": "web-intro-001",
      "isFree": true,
      "price": 0.00,
      "scheduledAt": "2026-04-20T14:00:00.000Z",
      "durationMinutes": 60,
      "maxAttendees": 100,
      "registeredCount": 0,
      "meetingPlatform": "zoom",
      "meetingUrl": "https://zoom.us/j/1234567890",
      "meetingId": "1234567890",
      "meetingPassword": "abc123",
      "recordingUrl": null,
      "webinarStatus": "scheduled",
      "displayOrder": 1,
      "createdBy": 54,
      "updatedBy": 54,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "translation": {
        "id": 1,
        "webinarId": 1,
        "languageId": 1,
        "title": "Introduction to Web Development",
        "description": "Learn the fundamentals of web development",
        "shortDescription": "Web dev basics",
        "thumbnailUrl": null,
        "bannerUrl": null,
        "tags": [],
        "metaTitle": null,
        "metaDescription": null,
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
        "twitterCard": "summary_large_image",
        "robotsDirective": "index,follow",
        "focusKeyword": null,
        "structuredData": [],
        "isActive": true,
        "isDeleted": false,
        "createdAt": "2026-04-12T10:01:00.000Z",
        "updatedAt": "2026-04-12T10:01:00.000Z",
        "deletedAt": null,
        "languageName": "English",
        "languageIsoCode": "en",
        "languageNativeName": "English"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 200 OK — empty result

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

#### 401 Unauthorized

```json
{ "success": false, "message": "Authentication required" }
```

#### 403 Forbidden

```json
{ "success": false, "message": "Insufficient permissions" }
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/webinars?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/webinars?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/webinars?pageIndex=1&pageSize=10` |
| 4 | Filter by languageId=1 | `{{baseUrl}}/api/v1/webinars?languageId=1` |
| 5 | Filter by webinarOwner=system | `{{baseUrl}}/api/v1/webinars?webinarOwner=system` |
| 6 | Filter by webinarOwner=instructor | `{{baseUrl}}/api/v1/webinars?webinarOwner=instructor` |
| 7 | Filter by webinarStatus=scheduled | `{{baseUrl}}/api/v1/webinars?webinarStatus=scheduled` |
| 8 | Filter by webinarStatus=live | `{{baseUrl}}/api/v1/webinars?webinarStatus=live` |
| 9 | Filter by webinarStatus=completed | `{{baseUrl}}/api/v1/webinars?webinarStatus=completed` |
| 10 | Filter by webinarStatus=cancelled | `{{baseUrl}}/api/v1/webinars?webinarStatus=cancelled` |
| 11 | Filter by meetingPlatform=zoom | `{{baseUrl}}/api/v1/webinars?meetingPlatform=zoom` |
| 12 | Filter by meetingPlatform=google_meet | `{{baseUrl}}/api/v1/webinars?meetingPlatform=google_meet` |
| 13 | Filter by meetingPlatform=teams | `{{baseUrl}}/api/v1/webinars?meetingPlatform=teams` |
| 14 | Filter by meetingPlatform=custom | `{{baseUrl}}/api/v1/webinars?meetingPlatform=custom` |
| 15 | Filter by isFree=true | `{{baseUrl}}/api/v1/webinars?isFree=true` |
| 16 | Filter by isFree=false (paid) | `{{baseUrl}}/api/v1/webinars?isFree=false` |
| 17 | Filter by courseId=1 | `{{baseUrl}}/api/v1/webinars?courseId=1` |
| 18 | Filter by chapterId=4 | `{{baseUrl}}/api/v1/webinars?chapterId=4` |
| 19 | Filter by instructorId=10 | `{{baseUrl}}/api/v1/webinars?instructorId=10` |
| 20 | Filter by isActive=true | `{{baseUrl}}/api/v1/webinars?isActive=true` |
| 21 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/webinars?isDeleted=true` |
| 22 | Search — "web development" | `{{baseUrl}}/api/v1/webinars?searchTerm=web%20development` |
| 23 | Search — "WEB_INTRO" | `{{baseUrl}}/api/v1/webinars?searchTerm=WEB_INTRO` |
| 24 | Filter owner + status | `{{baseUrl}}/api/v1/webinars?webinarOwner=system&webinarStatus=scheduled` |
| 25 | Filter free + platform | `{{baseUrl}}/api/v1/webinars?isFree=true&meetingPlatform=zoom` |
| 26 | Filter course + status | `{{baseUrl}}/api/v1/webinars?courseId=1&webinarStatus=completed` |
| 27 | Sort by scheduled_at DESC (default) | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_scheduled_at&sortDirection=DESC` |
| 28 | Sort by scheduled_at ASC (earliest) | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_scheduled_at&sortDirection=ASC` |
| 29 | Sort by title ASC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_trans_title&sortDirection=ASC` |
| 30 | Sort by price DESC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_price&sortDirection=DESC` |
| 31 | Sort by display_order ASC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_display_order&sortDirection=ASC` |
| 32 | Sort by registered_count DESC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_registered_count&sortDirection=DESC` |
| 33 | Sort by duration_minutes DESC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_duration_minutes&sortDirection=DESC` |
| 34 | Sort by code ASC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_code&sortDirection=ASC` |
| 35 | Sort by status ASC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_webinar_status&sortDirection=ASC` |
| 36 | Sort by platform ASC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_meeting_platform&sortDirection=ASC` |
| 37 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_created_at&sortDirection=DESC` |
| 38 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/webinars?sortColumn=webinar_updated_at&sortDirection=DESC` |
| 39 | Combo — scheduled zoom webinars, newest | `{{baseUrl}}/api/v1/webinars?webinarStatus=scheduled&meetingPlatform=zoom&sortColumn=webinar_scheduled_at&sortDirection=ASC` |
| 40 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/webinars?pageIndex=1&pageSize=10&webinarOwner=system&isFree=true&searchTerm=intro` |
| 41 | Combo — instructor paid webinars by price | `{{baseUrl}}/api/v1/webinars?webinarOwner=instructor&isFree=false&sortColumn=webinar_price&sortDirection=DESC` |
| 42 | Combo — completed webinars by registrations | `{{baseUrl}}/api/v1/webinars?webinarStatus=completed&sortColumn=webinar_registered_count&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/webinars/:id`

Get a single webinar by translation ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §1.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Webinar 999 not found" }
```

---

## 1.3 `POST /api/v1/webinars`

Create a new webinar.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `webinarOwner` | enum | no | Default: `system`. Values: `system`, `instructor`. |
| `instructorId` | int | cond. | Required when owner = `instructor`. Must be null for `system`. |
| `courseId` | int | no | Link to a course (must exist, non-deleted). |
| `chapterId` | int | no | Link to a chapter (must exist, non-deleted). |
| `code` | string | no | Unique identifier code (auto-generates slug). |
| `isFree` | bool | no | Default: `false`. |
| `price` | number | no | Default: 0.00. Max 99999999.99. |
| `scheduledAt` | datetime | no | ISO 8601 with timezone offset. |
| `durationMinutes` | int | no | Duration in minutes. |
| `maxAttendees` | int | no | null = unlimited. |
| `meetingPlatform` | enum | no | Default: `zoom`. Values: `zoom`, `google_meet`, `teams`, `custom`. |
| `meetingUrl` | string | no | Meeting join URL. |
| `meetingId` | string | no | Platform meeting ID. |
| `meetingPassword` | string | no | Meeting password. |
| `recordingUrl` | string | no | Recording URL (usually after completion). |
| `webinarStatus` | enum | no | Default: `scheduled`. Values: `scheduled`, `live`, `completed`, `cancelled`. |
| `displayOrder` | int | no | Default: 0. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "webinarOwner": "system",
  "code": "WEB_INTRO_001",
  "isFree": true,
  "scheduledAt": "2026-04-20T14:00:00+05:30",
  "durationMinutes": 60,
  "maxAttendees": 100,
  "meetingPlatform": "zoom",
  "meetingUrl": "https://zoom.us/j/1234567890",
  "meetingId": "1234567890",
  "meetingPassword": "abc123"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Webinar created",
  "data": { "id": 1, "webinarOwner": "system", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "system webinars cannot have an instructor_id." }
```

```json
{ "success": false, "message": "instructor webinars must have an instructor_id." }
```

```json
{ "success": false, "message": "course_id 999 does not exist or is deleted." }
```

---

## 1.4 `PATCH /api/v1/webinars/:id`

Update a webinar. `webinar_owner` is **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `instructorId` | int | Must be valid user. Only for `instructor` owner. |
| `courseId` | int | Must exist and not deleted. |
| `chapterId` | int | Must exist and not deleted. |
| `code` | string | Pass `""` to clear (set NULL). |
| `isFree` | bool | |
| `price` | number | |
| `scheduledAt` | datetime | |
| `durationMinutes` | int | |
| `maxAttendees` | int | |
| `meetingPlatform` | enum | |
| `meetingUrl` | string | Pass `""` to clear. |
| `meetingId` | string | Pass `""` to clear. |
| `meetingPassword` | string | Pass `""` to clear. |
| `recordingUrl` | string | Pass `""` to clear. |
| `webinarStatus` | enum | |
| `displayOrder` | int | |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated webinar (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "system webinars cannot have an instructor_id." }
```

#### 404 Not Found

```json
{ "success": false, "message": "webinar_id 999 does not exist or is deleted." }
```

---

## 1.5 `DELETE /api/v1/webinars/:id`

Soft-delete a webinar. **Cascades** to all webinar_translations.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Webinar deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "webinar_id 1 is already deleted." }
```

---

## 1.6 `POST /api/v1/webinars/:id/restore`

Restore a soft-deleted webinar. **Cascades** restore to all translations. Validates parent course/chapter not deleted.

### Responses

#### 200 OK

Returns the restored webinar (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore webinar: parent course is deleted." }
```

```json
{ "success": false, "message": "webinar_id 1 is not deleted." }
```

---

## 2.1 `GET /api/v1/webinars/:id/translations`

List all translations for a specific webinar.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | |
| `pageSize` | int | `20` | |
| `languageId` | int | — | Filter by language. |
| `isActive` | bool | — | |
| `isDeleted` | bool | `false` | |
| `searchTerm` | string | — | ILIKE on title, description, short_description, focus_keyword. |
| `sortColumn` | enum | `created_at` | `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `DESC` | |

### Responses

#### 200 OK

Same paginated shape as §1.1, filtered to translations of the given webinar.

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/webinars/1/translations?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/webinars/1/translations?pageIndex=2&pageSize=20` |
| 3 | Filter by languageId=1 | `{{baseUrl}}/api/v1/webinars/1/translations?languageId=1` |
| 4 | Filter by isActive=true | `{{baseUrl}}/api/v1/webinars/1/translations?isActive=true` |
| 5 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/webinars/1/translations?isDeleted=true` |
| 6 | Search — "web" | `{{baseUrl}}/api/v1/webinars/1/translations?searchTerm=web` |
| 7 | Sort by id ASC | `{{baseUrl}}/api/v1/webinars/1/translations?sortColumn=id&sortDirection=ASC` |
| 8 | Sort by title ASC | `{{baseUrl}}/api/v1/webinars/1/translations?sortColumn=title&sortDirection=ASC` |
| 9 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/webinars/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 10 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/webinars/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 11 | Combo — language + search | `{{baseUrl}}/api/v1/webinars/1/translations?languageId=1&searchTerm=intro` |
| 12 | Combo — filter + sort + paginate | `{{baseUrl}}/api/v1/webinars/1/translations?pageIndex=1&pageSize=10&isActive=true&sortColumn=title&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/webinars/:id/translations/:tid`

Get a single translation by translation ID.

### Responses

#### 200 OK / 404 Not Found

Same as §1.2 pattern.

---

## 2.3 `POST /api/v1/webinars/:id/translations`

Create a translation for a webinar. One translation per language per webinar.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | **yes** | Must reference active, non-deleted language. |
| `title` | string | **yes** | 1-500 chars. |
| `description` | string | no | Up to 10,000 chars. |
| `shortDescription` | string | no | Up to 2,000 chars. |
| `thumbnailUrl` | string | no | URL (up to 2000 chars). |
| `bannerUrl` | string | no | URL (up to 2000 chars). |
| `tags` | json array | no | e.g., `["webinar", "live"]`. |
| `metaTitle` | string | no | SEO. |
| `metaDescription` | string | no | SEO. |
| `metaKeywords` | string | no | SEO. |
| `canonicalUrl` | string | no | SEO. |
| `ogSiteName` | string | no | Open Graph. |
| `ogTitle` | string | no | Open Graph. |
| `ogDescription` | string | no | Open Graph. |
| `ogType` | string | no | Open Graph. |
| `ogImage` | string | no | Open Graph. |
| `ogUrl` | string | no | Open Graph. |
| `twitterSite` | string | no | Twitter Card. |
| `twitterTitle` | string | no | Twitter Card. |
| `twitterDescription` | string | no | Twitter Card. |
| `twitterImage` | string | no | Twitter Card. |
| `twitterCard` | string | no | Default: `summary_large_image`. |
| `robotsDirective` | string | no | Default: `index,follow`. |
| `focusKeyword` | string | no | SEO. |
| `structuredData` | json array | no | JSON-LD. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "languageId": 1,
  "title": "Introduction to Web Development",
  "description": "Learn the fundamentals of web development in this live session",
  "shortDescription": "Web dev basics",
  "tags": ["webinar", "web-dev", "live"]
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Webinar translation created",
  "data": { "id": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "webinar_id 999 does not exist, is inactive, or is deleted." }
```

```json
{ "success": false, "message": "A translation for this webinar and language already exists." }
```

---

## 2.4 `PATCH /api/v1/webinars/:id/translations/:tid`

Update a translation. `webinar_id` and `language_id` are immutable. Text fields support clearing by sending empty string `""` (sets to NULL). `title` is non-clearable — pass `null` to keep current. JSONB fields use COALESCE (NULL = keep current).

**Request body** — at least one field required. Same fields as §2.3 except `languageId`.

### Responses

#### 200 OK

Returns the updated translation.

#### 400 Bad Request

```json
{ "success": false, "message": "title cannot be empty string. Use NULL to keep current value." }
```

---

## 2.5 `DELETE /api/v1/webinars/:id/translations/:tid`

Soft-delete a single translation.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Webinar translation deleted", "data": { "id": 1, "deleted": true } }
```

---

## 2.6 `POST /api/v1/webinars/:id/translations/:tid/restore`

Restore a soft-deleted translation. Validates parent webinar is not deleted.

### Responses

#### 200 OK

Returns the restored translation.

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore translation: parent webinar is deleted." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same webinar+language translation). |
| `500` | Internal server error. |
