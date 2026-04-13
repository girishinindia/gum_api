# Phase 13 — Course Batches

Course batches represent scheduled cohort-based sessions for a course on the Grow Up More platform. Each batch belongs to a course, can be system-owned or instructor-owned, optionally includes pricing (free or paid), capacity limits, scheduling (start/end dates + JSON schedule), meeting details (Zoom, Google Meet, Teams, custom), and status tracking. Batches support multilingual translations with full SEO metadata (Open Graph, Twitter Card, structured data). Batches support soft-delete with cascade to translations and sessions, and admin restore.

Permission codes: `course_batch.read`, `course_batch.create`, `course_batch.update`, `course_batch.delete`, `course_batch.restore`, `batch_translation.read`, `batch_translation.create`, `batch_translation.update`, `batch_translation.delete`, `batch_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `course_batch.delete` and `batch_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-batches) | `GET` | `/api/v1/course-batches` | `course_batch.read` | List course batches with pagination, search, filter, sort. |
| [§1.2](#12-get-apiv1course-batchesid) | `GET` | `/api/v1/course-batches/:id` | `course_batch.read` | Get one batch by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1course-batches) | `POST` | `/api/v1/course-batches` | `course_batch.create` | Create a new course batch. |
| [§1.4](#14-patch-apiv1course-batchesid) | `PATCH` | `/api/v1/course-batches/:id` | `course_batch.update` | Update a course batch. |
| [§1.5](#15-delete-apiv1course-batchesid) | `DELETE` | `/api/v1/course-batches/:id` | `course_batch.delete` | Soft-delete (cascades to translations + sessions). |
| [§1.6](#16-post-apiv1course-batchesidrestore) | `POST` | `/api/v1/course-batches/:id/restore` | `course_batch.restore` | Restore a soft-deleted batch (cascades). |
| [§2.1](#21-get-apiv1course-batchesidtranslations) | `GET` | `/api/v1/course-batches/:id/translations` | `batch_translation.read` | List translations of a batch. |
| [§2.2](#22-get-apiv1course-batchesidtranslationstid) | `GET` | `/api/v1/course-batches/:id/translations/:tid` | `batch_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1course-batchesidtranslations) | `POST` | `/api/v1/course-batches/:id/translations` | `batch_translation.create` | Create a translation. |
| [§2.4](#24-patch-apiv1course-batchesidtranslationstid) | `PATCH` | `/api/v1/course-batches/:id/translations/:tid` | `batch_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1course-batchesidtranslationstid) | `DELETE` | `/api/v1/course-batches/:id/translations/:tid` | `batch_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1course-batchesidtranslationstidrestore) | `POST` | `/api/v1/course-batches/:id/translations/:tid/restore` | `batch_translation.restore` | Restore a soft-deleted translation. |

---

## Enums reference

**batch_owner**: `system`, `instructor`

**batch_status**: `upcoming`, `in_progress`, `completed`, `cancelled`

**meeting_platform**: `zoom`, `google_meet`, `teams`, `custom`

### Owner-FK constraint

| batch_owner | instructor_id |
|---|---|
| `system` | Must be `null` |
| `instructor` | Must be provided (valid, non-deleted user) |

---

## 1.1 `GET /api/v1/course-batches`

List all course batches.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `courseId` | int | — | Filter by course. |
| `batchOwner` | enum | — | `system`, `instructor`. |
| `batchStatus` | enum | — | `upcoming`, `in_progress`, `completed`, `cancelled`. |
| `isFree` | bool | — | Filter free/paid batches. |
| `meetingPlatform` | enum | — | `zoom`, `google_meet`, `teams`, `custom`. |
| `instructorId` | int | — | Filter by instructor. |
| `isDeleted` | bool | `false` | Include soft-deleted batches. |
| `searchTerm` | string | — | Searches code, slug (ILIKE). |
| `sortColumn` | enum | `created_at` | See **Sort columns** below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

`id`, `course_id`, `is_free`, `price`, `batch_status`, `starts_at`, `created_at`, `updated_at`.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "courseId": 1,
      "batchOwner": "system",
      "instructorId": null,
      "instructorFirstName": null,
      "instructorLastName": null,
      "instructorEmail": null,
      "code": "BATCH_PYTHON_001",
      "isFree": false,
      "price": 4999.00,
      "includesCourseAccess": true,
      "maxStudents": 30,
      "startsAt": "2026-05-01T09:00:00.000Z",
      "endsAt": "2026-06-30T17:00:00.000Z",
      "schedule": [{"day": "Monday", "time": "09:00-11:00"}, {"day": "Wednesday", "time": "09:00-11:00"}],
      "meetingPlatform": "zoom",
      "batchStatus": "upcoming",
      "displayOrder": 1,
      "createdBy": 54,
      "updatedBy": 54,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/course-batches?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/course-batches?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/course-batches?pageIndex=1&pageSize=10` |
| 4 | Filter by courseId=1 | `{{baseUrl}}/api/v1/course-batches?courseId=1` |
| 5 | Filter by batchOwner=system | `{{baseUrl}}/api/v1/course-batches?batchOwner=system` |
| 6 | Filter by batchOwner=instructor | `{{baseUrl}}/api/v1/course-batches?batchOwner=instructor` |
| 7 | Filter by batchStatus=upcoming | `{{baseUrl}}/api/v1/course-batches?batchStatus=upcoming` |
| 8 | Filter by batchStatus=in_progress | `{{baseUrl}}/api/v1/course-batches?batchStatus=in_progress` |
| 9 | Filter by batchStatus=completed | `{{baseUrl}}/api/v1/course-batches?batchStatus=completed` |
| 10 | Filter by batchStatus=cancelled | `{{baseUrl}}/api/v1/course-batches?batchStatus=cancelled` |
| 11 | Filter by meetingPlatform=zoom | `{{baseUrl}}/api/v1/course-batches?meetingPlatform=zoom` |
| 12 | Filter by meetingPlatform=google_meet | `{{baseUrl}}/api/v1/course-batches?meetingPlatform=google_meet` |
| 13 | Filter by meetingPlatform=teams | `{{baseUrl}}/api/v1/course-batches?meetingPlatform=teams` |
| 14 | Filter by meetingPlatform=custom | `{{baseUrl}}/api/v1/course-batches?meetingPlatform=custom` |
| 15 | Filter by isFree=true | `{{baseUrl}}/api/v1/course-batches?isFree=true` |
| 16 | Filter by isFree=false (paid) | `{{baseUrl}}/api/v1/course-batches?isFree=false` |
| 17 | Filter by instructorId=10 | `{{baseUrl}}/api/v1/course-batches?instructorId=10` |
| 18 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/course-batches?isDeleted=true` |
| 19 | Search — "PYTHON" | `{{baseUrl}}/api/v1/course-batches?searchTerm=PYTHON` |
| 20 | Search — "batch" | `{{baseUrl}}/api/v1/course-batches?searchTerm=batch` |
| 21 | Filter owner + status | `{{baseUrl}}/api/v1/course-batches?batchOwner=system&batchStatus=upcoming` |
| 22 | Filter free + platform | `{{baseUrl}}/api/v1/course-batches?isFree=true&meetingPlatform=zoom` |
| 23 | Filter course + status | `{{baseUrl}}/api/v1/course-batches?courseId=1&batchStatus=completed` |
| 24 | Sort by starts_at ASC (earliest) | `{{baseUrl}}/api/v1/course-batches?sortColumn=starts_at&sortDirection=ASC` |
| 25 | Sort by starts_at DESC (latest) | `{{baseUrl}}/api/v1/course-batches?sortColumn=starts_at&sortDirection=DESC` |
| 26 | Sort by price DESC | `{{baseUrl}}/api/v1/course-batches?sortColumn=price&sortDirection=DESC` |
| 27 | Sort by price ASC | `{{baseUrl}}/api/v1/course-batches?sortColumn=price&sortDirection=ASC` |
| 28 | Sort by batch_status ASC | `{{baseUrl}}/api/v1/course-batches?sortColumn=batch_status&sortDirection=ASC` |
| 29 | Sort by course_id ASC | `{{baseUrl}}/api/v1/course-batches?sortColumn=course_id&sortDirection=ASC` |
| 30 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/course-batches?sortColumn=created_at&sortDirection=DESC` |
| 31 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/course-batches?sortColumn=updated_at&sortDirection=DESC` |
| 32 | Combo — upcoming zoom batches, earliest start | `{{baseUrl}}/api/v1/course-batches?batchStatus=upcoming&meetingPlatform=zoom&sortColumn=starts_at&sortDirection=ASC` |
| 33 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/course-batches?pageIndex=1&pageSize=10&batchOwner=system&isFree=true&searchTerm=intro` |
| 34 | Combo — instructor paid batches by price | `{{baseUrl}}/api/v1/course-batches?batchOwner=instructor&isFree=false&sortColumn=price&sortDirection=DESC` |
| 35 | Combo — completed batches by updated | `{{baseUrl}}/api/v1/course-batches?batchStatus=completed&sortColumn=updated_at&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/course-batches/:id`

Get a single course batch by ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §1.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Course batch 999 not found" }
```

---

## 1.3 `POST /api/v1/course-batches`

Create a new course batch.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | **yes** | Must reference existing, non-deleted course. |
| `batchOwner` | enum | no | Default: `system`. Values: `system`, `instructor`. |
| `instructorId` | int | cond. | Required when owner = `instructor`. Must be null for `system`. |
| `code` | string | no | Unique identifier code (auto-generates slug). 1-100 chars. |
| `isFree` | bool | no | Default: `false`. |
| `price` | number | no | Default: 0.00. Max 99999999.99. |
| `includesCourseAccess` | bool | no | Default: `false`. Whether batch price includes course access. |
| `maxStudents` | int | no | null = unlimited. |
| `startsAt` | datetime | no | ISO 8601 with timezone offset. |
| `endsAt` | datetime | no | ISO 8601 with timezone offset. |
| `schedule` | json | no | JSONB array of schedule objects (e.g., `[{"day":"Monday","time":"09:00-11:00"}]`). |
| `meetingPlatform` | enum | no | Default: `zoom`. Values: `zoom`, `google_meet`, `teams`, `custom`. |
| `batchStatus` | enum | no | Default: `upcoming`. Values: `upcoming`, `in_progress`, `completed`, `cancelled`. |
| `displayOrder` | int | no | Default: 0. Max 32767. |

**Example request**

```json
{
  "courseId": 1,
  "batchOwner": "system",
  "code": "BATCH_PYTHON_001",
  "isFree": false,
  "price": 4999.00,
  "includesCourseAccess": true,
  "maxStudents": 30,
  "startsAt": "2026-05-01T09:00:00+05:30",
  "endsAt": "2026-06-30T17:00:00+05:30",
  "schedule": [
    { "day": "Monday", "time": "09:00-11:00" },
    { "day": "Wednesday", "time": "09:00-11:00" }
  ],
  "meetingPlatform": "zoom",
  "batchStatus": "upcoming"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Course batch created",
  "data": { "id": 1, "courseId": 1, "batchOwner": "system", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "system batches cannot have an instructor_id." }
```

```json
{ "success": false, "message": "instructor batches must have an instructor_id." }
```

```json
{ "success": false, "message": "course_id 999 does not exist or is deleted." }
```

---

## 1.4 `PATCH /api/v1/course-batches/:id`

Update a course batch. `batch_owner` and `course_id` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `instructorId` | int | Must be valid user. Only for `instructor` owner. |
| `code` | string | Pass `""` to clear (set NULL). |
| `isFree` | bool | |
| `price` | number | |
| `includesCourseAccess` | bool | |
| `maxStudents` | int | |
| `startsAt` | datetime | |
| `endsAt` | datetime | |
| `schedule` | json | JSONB array. |
| `meetingPlatform` | enum | |
| `batchStatus` | enum | |
| `displayOrder` | int | |

### Responses

#### 200 OK

Returns the updated batch (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "system batches cannot have an instructor_id." }
```

#### 404 Not Found

```json
{ "success": false, "message": "batch_id 999 does not exist or is deleted." }
```

---

## 1.5 `DELETE /api/v1/course-batches/:id`

Soft-delete a course batch. **Cascades** to all batch_translations, batch_sessions, and batch_session_translations.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Course batch deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "batch_id 1 is already deleted." }
```

---

## 1.6 `POST /api/v1/course-batches/:id/restore`

Restore a soft-deleted course batch. **Cascades** restore to all translations and sessions. Validates parent course is not deleted.

### Responses

#### 200 OK

Returns the restored batch (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore batch: parent course is deleted." }
```

```json
{ "success": false, "message": "batch_id 1 is not deleted." }
```

---

## 2.1 `GET /api/v1/course-batches/:id/translations`

List all translations for a specific course batch.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | |
| `pageSize` | int | `20` | |
| `sortColumn` | enum | `created_at` | `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `DESC` | |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "batchId": 1,
      "languageId": 1,
      "title": "Python Mastery Batch - May 2026",
      "description": "Intensive Python batch covering fundamentals to advanced topics",
      "shortDescription": "Python mastery in 8 weeks",
      "tags": ["python", "programming", "batch"],
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
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/course-batches/1/translations?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/course-batches/1/translations?pageIndex=2&pageSize=20` |
| 3 | Sort by id ASC | `{{baseUrl}}/api/v1/course-batches/1/translations?sortColumn=id&sortDirection=ASC` |
| 4 | Sort by title ASC | `{{baseUrl}}/api/v1/course-batches/1/translations?sortColumn=title&sortDirection=ASC` |
| 5 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/course-batches/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 6 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/course-batches/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 7 | Custom page size (5) | `{{baseUrl}}/api/v1/course-batches/1/translations?pageIndex=1&pageSize=5` |
| 8 | Combo — sort + paginate | `{{baseUrl}}/api/v1/course-batches/1/translations?pageIndex=1&pageSize=10&sortColumn=title&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/course-batches/:id/translations/:tid`

Get a single translation by translation ID.

### Responses

#### 200 OK / 404 Not Found

Same as §1.2 pattern.

---

## 2.3 `POST /api/v1/course-batches/:id/translations`

Create a translation for a course batch. One translation per language per batch.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | **yes** | Must reference active, non-deleted language. |
| `title` | string | **yes** | 1-500 chars. |
| `description` | string | no | Up to 10,000 chars. |
| `shortDescription` | string | no | Up to 2,000 chars. |
| `tags` | json array | no | e.g., `["python", "batch"]`. |
| `metaTitle` | string | no | SEO. Max 255 chars. |
| `metaDescription` | string | no | SEO. Max 500 chars. |
| `metaKeywords` | string | no | SEO. Max 500 chars. |
| `canonicalUrl` | string | no | SEO. Max 2000 chars. |
| `ogSiteName` | string | no | Open Graph. Max 500 chars. |
| `ogTitle` | string | no | Open Graph. Max 255 chars. |
| `ogDescription` | string | no | Open Graph. Max 500 chars. |
| `ogType` | string | no | Open Graph. Max 100 chars. |
| `ogImage` | string | no | Open Graph. Max 2000 chars. |
| `ogUrl` | string | no | Open Graph. Max 2000 chars. |
| `twitterSite` | string | no | Twitter Card. Max 255 chars. |
| `twitterTitle` | string | no | Twitter Card. Max 255 chars. |
| `twitterDescription` | string | no | Twitter Card. Max 500 chars. |
| `twitterImage` | string | no | Twitter Card. Max 2000 chars. |
| `twitterCard` | string | no | Default: `summary_large_image`. Max 100 chars. |
| `robotsDirective` | string | no | Default: `index,follow`. Max 100 chars. |
| `focusKeyword` | string | no | SEO. Max 500 chars. |
| `structuredData` | json array | no | JSON-LD structured data. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "languageId": 1,
  "title": "Python Mastery Batch - May 2026",
  "description": "Intensive Python batch covering fundamentals to advanced topics",
  "shortDescription": "Python mastery in 8 weeks",
  "tags": ["python", "programming", "batch"]
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Batch translation created",
  "data": { "id": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "batch_id 999 does not exist, is inactive, or is deleted." }
```

```json
{ "success": false, "message": "A translation for this batch and language already exists." }
```

---

## 2.4 `PATCH /api/v1/course-batches/:id/translations/:tid`

Update a translation. `batch_id` and `language_id` are immutable. Text fields support clearing by sending empty string `""` (sets to NULL). `title` is non-clearable — pass `null` to keep current. JSONB fields use COALESCE (NULL = keep current).

**Request body** — at least one field required. Same fields as §2.3 except `languageId`.

### Responses

#### 200 OK

Returns the updated translation.

#### 400 Bad Request

```json
{ "success": false, "message": "title cannot be empty string. Use NULL to keep current value." }
```

---

## 2.5 `DELETE /api/v1/course-batches/:id/translations/:tid`

Soft-delete a single translation.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Batch translation deleted", "data": { "id": 1, "deleted": true } }
```

---

## 2.6 `POST /api/v1/course-batches/:id/translations/:tid/restore`

Restore a soft-deleted translation. Validates parent batch is not deleted.

### Responses

#### 200 OK

Returns the restored translation.

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore translation: parent batch is deleted." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same batch+language translation). |
| `500` | Internal server error. |
