# Phase 9 — Course Module Topics

A course-module-topic is a dual-mode junction table that links topics to course modules. Records can operate in one of two modes: **linked mode** (references an existing topic via topic_id) or **custom mode** (defines a custom topic inline via custom_title). A CHECK constraint requires at least one of topic_id or custom_title to be present. Course module topics support soft-delete and admin restore, and include fields for display ordering, estimated duration, preview status, and descriptive notes. All routes require authentication.

Permission codes: `course_module_topic.read`, `course_module_topic.create`, `course_module_topic.update`, `course_module_topic.delete`, `course_module_topic.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Previous](./06%20-%20course-instructors.md) · [Next →](./08%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-module-topics) | `GET` | `{{baseUrl}}/api/v1/course-module-topics` | `course_module_topic.read` | List all course module topics with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1course-module-topicsid) | `GET` | `{{baseUrl}}/api/v1/course-module-topics/:id` | `course_module_topic.read` | Get one topic by ID. |
| [§1.3](#13-post-apiv1course-module-topics) | `POST` | `{{baseUrl}}/api/v1/course-module-topics` | `course_module_topic.create` | Create a new course module topic (linked or custom). |
| [§1.4](#14-patch-apiv1course-module-topicsid) | `PATCH` | `{{baseUrl}}/api/v1/course-module-topics/:id` | `course_module_topic.update` | Update a topic by ID. |
| [§1.5](#15-delete-apiv1course-module-topicsid) | `DELETE` | `{{baseUrl}}/api/v1/course-module-topics/:id` | `course_module_topic.delete` | Soft-delete a topic (SA only). |
| [§1.6](#16-post-apiv1course-module-topicsidrestore) | `POST` | `{{baseUrl}}/api/v1/course-module-topics/:id/restore` | `course_module_topic.restore` | Restore a soft-deleted topic (admin+ only). |

---

## 1.1 `GET /api/v1/course-module-topics`

List all course module topics with support for pagination, search, filtering, and sorting. Results include denormalized course, module, and topic metadata for quick reference.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-module-topics` |
| Permission | `course_module_topic.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `0` | 0-based page number. |
| `pageSize` | int | `20` | 1..500. |
| `courseModuleId` | int | — | Filter by course module ID. |
| `topicId` | int | — | Filter by topic ID. |
| `hasTopic` | bool | — | Filter by mode: `true` = linked mode only (has topic_id), `false` = custom mode only (has custom_title, no topic_id). |
| `isPreview` | bool | — | Filter by preview flag. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | `false` | Include/exclude soft-deleted records. Defaults to false. |
| `searchTerm` | string | — | `ILIKE` across course code, course slug, module slug, custom title, topic slug. |
| `sortColumn` | enum | `id` | `id`, `display_order`, `course_module_id`, `custom_title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |

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
      "topicId": 3,
      "courseCode": "TC-CS-01",
      "courseSlug": "test-course-for-cs",
      "courseModuleSlug": "test-module-for-cs",
      "customTitle": null,
      "topicSlug": "test-topic-for-cmt",
      "displayOrder": 1,
      "estimatedMinutes": 45,
      "isPreview": false,
      "isActive": true,
      "createdAt": "2026-04-12T10:56:38.031Z",
      "updatedAt": "2026-04-12T10:56:38.031Z"
    },
    {
      "id": 2,
      "courseModuleId": 1,
      "topicId": null,
      "courseCode": "TC-CS-01",
      "courseSlug": "test-course-for-cs",
      "courseModuleSlug": "test-module-for-cs",
      "customTitle": "Advanced Custom Topic",
      "topicSlug": null,
      "displayOrder": 2,
      "estimatedMinutes": 60,
      "isPreview": true,
      "isActive": true,
      "createdAt": "2026-04-12T11:00:00.000Z",
      "updatedAt": "2026-04-12T11:00:00.000Z"
    },
    {
      "id": 3,
      "courseModuleId": 1,
      "topicId": 5,
      "courseCode": "TC-CS-01",
      "courseSlug": "test-course-for-cs",
      "courseModuleSlug": "test-module-for-cs",
      "customTitle": null,
      "topicSlug": "test-topic-5",
      "displayOrder": 3,
      "estimatedMinutes": null,
      "isPreview": false,
      "isActive": true,
      "createdAt": "2026-04-11T14:30:00.000Z",
      "updatedAt": "2026-04-11T14:30:00.000Z"
    }
  ],
  "meta": { "page": 0, "limit": 20, "totalCount": 42, "totalPages": 3 }
}
```

#### 403 Forbidden — caller lacks `course_module_topic.read`

```json
{
  "success": false,
  "message": "Missing required permission: course_module_topic.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/course-module-topics` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 0 (defaults) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=0&pageSize=20` |
| 2 | Page 1, default size | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=1&pageSize=20` |
| 3 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=2&pageSize=20` |
| 4 | Page 0, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=0&pageSize=5` |
| 5 | Page 0, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=0&pageSize=10` |
| 6 | Page 0, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=0&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=9999&pageSize=20` |
| 8 | Filter by courseModuleId=1 | `GET` | `{{baseUrl}}/api/v1/course-module-topics?courseModuleId=1` |
| 9 | Filter by courseModuleId=2 | `GET` | `{{baseUrl}}/api/v1/course-module-topics?courseModuleId=2` |
| 10 | Filter by topicId=3 | `GET` | `{{baseUrl}}/api/v1/course-module-topics?topicId=3` |
| 11 | Filter by topicId=5 | `GET` | `{{baseUrl}}/api/v1/course-module-topics?topicId=5` |
| 12 | Linked topics only (hasTopic=true) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?hasTopic=true` |
| 13 | Custom topics only (hasTopic=false) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?hasTopic=false` |
| 14 | Preview only (isPreview=true) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isPreview=true` |
| 15 | Non-preview only (isPreview=false) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isPreview=false` |
| 16 | Active only (isActive=true) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isActive=true` |
| 17 | Inactive only (isActive=false) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isActive=false` |
| 18 | Deleted only (isDeleted=true) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isDeleted=true` |
| 19 | Non-deleted only (isDeleted=false) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isDeleted=false` |
| 20 | Search — "Advanced Custom Topic" | `GET` | `{{baseUrl}}/api/v1/course-module-topics?searchTerm=Advanced%20Custom%20Topic` |
| 21 | Search — "test-topic-for-cmt" | `GET` | `{{baseUrl}}/api/v1/course-module-topics?searchTerm=test-topic-for-cmt` |
| 22 | Search — "TC-CS-01" | `GET` | `{{baseUrl}}/api/v1/course-module-topics?searchTerm=TC-CS-01` |
| 23 | Search — "test-course-for-cs" | `GET` | `{{baseUrl}}/api/v1/course-module-topics?searchTerm=test-course-for-cs` |
| 24 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=0&pageSize=10&searchTerm=Advanced` |
| 25 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=id&sortDirection=ASC` |
| 26 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=id&sortDirection=DESC` |
| 27 | Sort by `display_order` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=display_order&sortDirection=ASC` |
| 28 | Sort by `display_order` DESC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=display_order&sortDirection=DESC` |
| 29 | Sort by `course_module_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=course_module_id&sortDirection=ASC` |
| 30 | Sort by `course_module_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=course_module_id&sortDirection=DESC` |
| 31 | Sort by `custom_title` ASC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=custom_title&sortDirection=ASC` |
| 32 | Sort by `custom_title` DESC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=custom_title&sortDirection=DESC` |
| 33 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=created_at&sortDirection=DESC` |
| 34 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=created_at&sortDirection=ASC` |
| 35 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=updated_at&sortDirection=DESC` |
| 36 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/course-module-topics?sortColumn=updated_at&sortDirection=ASC` |
| 37 | Combo — courseModuleId=1, topicId=3 | `GET` | `{{baseUrl}}/api/v1/course-module-topics?courseModuleId=1&topicId=3` |
| 38 | Combo — courseModuleId=1, linked only | `GET` | `{{baseUrl}}/api/v1/course-module-topics?courseModuleId=1&hasTopic=true` |
| 39 | Combo — courseModuleId=1, custom only | `GET` | `{{baseUrl}}/api/v1/course-module-topics?courseModuleId=1&hasTopic=false` |
| 40 | Combo — courseModuleId=1, sorted by displayOrder | `GET` | `{{baseUrl}}/api/v1/course-module-topics?courseModuleId=1&sortColumn=display_order&sortDirection=ASC` |
| 41 | Combo — active, non-deleted, sorted by id | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isActive=true&isDeleted=false&sortColumn=id&sortDirection=ASC` |
| 42 | Combo — preview topics, linked mode only | `GET` | `{{baseUrl}}/api/v1/course-module-topics?isPreview=true&hasTopic=true` |
| 43 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/course-module-topics?pageIndex=0&pageSize=10&searchTerm=Advanced&courseModuleId=1&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/course-module-topics/:id`

Get one course module topic by ID, including all denormalized course, module, and topic metadata. Returns even soft-deleted records (does not skip is_deleted filter).

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-module-topics/:id` |
| Permission | `course_module_topic.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — linked mode topic

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseModuleId": 1,
    "topicId": 3,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "courseModuleSlug": "test-module-for-cs",
    "customTitle": null,
    "customDescription": null,
    "topicSlug": "test-topic-for-cmt",
    "displayOrder": 1,
    "estimatedMinutes": 45,
    "isPreview": false,
    "note": "Core foundational material",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:56:38.031Z"
  }
}
```

#### 200 OK — custom mode topic

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 2,
    "courseModuleId": 1,
    "topicId": null,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "courseModuleSlug": "test-module-for-cs",
    "customTitle": "Advanced Custom Topic",
    "customDescription": "This is a custom topic not linked to any system topic",
    "topicSlug": null,
    "displayOrder": 2,
    "estimatedMinutes": 60,
    "isPreview": true,
    "note": "Created for specific course needs",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T11:00:00.000Z",
    "updatedAt": "2026-04-12T11:00:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module topic 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module_topic.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/course-module-topics`

Create a new course module topic in either linked mode (with topicId) or custom mode (with customTitle). The CHECK constraint requires at least one of topicId or customTitle to be present. The course module must exist and not be deleted. The topic (if linked mode) must exist and not be deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-module-topics` |
| Permission | `course_module_topic.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseModuleId` | int | yes | Foreign key to course_modules table. Course module must exist and not be deleted. |
| `topicId` | int | conditional | Required if customTitle not provided. Foreign key to topics table. Topic must exist and not be deleted. Mutually requires customTitle to be null. |
| `customTitle` | string | conditional | Required if topicId not provided. Maximum 500 characters. Mutually requires topicId to be null. |
| `customDescription` | string | no | Custom description. Maximum 5000 characters. Only valid in custom mode. Defaults to `null`. |
| `displayOrder` | int | no | Display order for UI rendering. Defaults to `0`. Minimum value 0. |
| `estimatedMinutes` | int | no | Estimated time to complete in minutes. Defaults to `null`. |
| `isPreview` | bool | no | Whether this topic is preview/sample content. Defaults to `false`. |
| `note` | string | no | Internal note (e.g., for instructors). Maximum 1000 characters. Defaults to `null`. |
| `isActive` | bool | no | Defaults to `true`. |

### Sample request — linked mode (with topicId)

```json
{
  "courseModuleId": 1,
  "topicId": 3,
  "displayOrder": 1,
  "estimatedMinutes": 45,
  "isPreview": false,
  "note": "Core foundational material"
}
```

### Sample request — custom mode (with customTitle)

```json
{
  "courseModuleId": 1,
  "customTitle": "Advanced Custom Topic",
  "customDescription": "This is a custom topic not linked to any system topic",
  "displayOrder": 2,
  "estimatedMinutes": 60,
  "isPreview": true,
  "note": "Created for specific course needs"
}
```

### Sample request — custom mode, minimal

```json
{
  "courseModuleId": 1,
  "customTitle": "Quick Intro"
}
```

### Sample request — linked mode, minimal

```json
{
  "courseModuleId": 1,
  "topicId": 3
}
```

### Responses

#### 201 Created — linked mode (happy path)

```json
{
  "success": true,
  "message": "Course module topic created",
  "data": {
    "id": 1,
    "courseModuleId": 1,
    "topicId": 3,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "courseModuleSlug": "test-module-for-cs",
    "customTitle": null,
    "customDescription": null,
    "topicSlug": "test-topic-for-cmt",
    "displayOrder": 1,
    "estimatedMinutes": 45,
    "isPreview": false,
    "note": "Core foundational material",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:56:38.031Z"
  }
}
```

#### 201 Created — custom mode (happy path)

```json
{
  "success": true,
  "message": "Course module topic created",
  "data": {
    "id": 2,
    "courseModuleId": 1,
    "topicId": null,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "courseModuleSlug": "test-module-for-cs",
    "customTitle": "Advanced Custom Topic",
    "customDescription": "This is a custom topic not linked to any system topic",
    "topicSlug": null,
    "displayOrder": 2,
    "estimatedMinutes": 60,
    "isPreview": true,
    "note": "Created for specific course needs",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T11:00:00.000Z",
    "updatedAt": "2026-04-12T11:00:00.000Z"
  }
}
```

#### 400 Bad Request — neither topicId nor customTitle provided

```json
{
  "success": false,
  "message": "At least one of topicId or customTitle must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — both topicId and customTitle provided

```json
{
  "success": false,
  "message": "Only one of topicId or customTitle can be provided (not both)",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — course module does not exist

```json
{
  "success": false,
  "message": "Course module 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — topic does not exist (linked mode)

```json
{
  "success": false,
  "message": "Topic 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate linked topic in module

```json
{
  "success": false,
  "message": "An active course module topic for module 1 and topic 3 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate custom title in module

```json
{
  "success": false,
  "message": "An active course module topic with title 'Advanced Custom Topic' already exists in module 1",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module_topic.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/course-module-topics/:id`

Update a course module topic. courseModuleId and topicId are immutable. At least one other field must be provided. Text fields (customTitle, customDescription, note) can be cleared by sending an empty string.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-module-topics/:id` |
| Permission | `course_module_topic.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | Display order for UI rendering. Minimum value 0. |
| `customTitle` | string | Custom title (custom mode only). Maximum 500 characters. Pass empty string `""` to clear. |
| `customDescription` | string | Custom description (custom mode only). Maximum 5000 characters. Pass empty string `""` to clear. |
| `estimatedMinutes` | int | Estimated time to complete in minutes. Pass `null` to clear. |
| `isPreview` | bool | Whether this topic is preview/sample content. |
| `note` | string | Internal note. Maximum 1000 characters. Pass empty string `""` to clear. |
| `isActive` | bool | Active flag. |

### Sample request — update displayOrder and isPreview

```json
{
  "displayOrder": 2,
  "isPreview": true
}
```

### Sample request — update custom title

```json
{
  "customTitle": "Updated Custom Title"
}
```

### Sample request — clear custom title

```json
{
  "customTitle": ""
}
```

### Sample request — update estimated minutes

```json
{
  "estimatedMinutes": 90
}
```

### Sample request — clear estimated minutes

```json
{
  "estimatedMinutes": null
}
```

### Sample request — update note

```json
{
  "note": "Updated instructor note"
}
```

### Sample request — clear note

```json
{
  "note": ""
}
```

### Sample request — deactivate

```json
{
  "isActive": false
}
```

### Sample request — multiple fields

```json
{
  "displayOrder": 3,
  "customDescription": "Updated description",
  "estimatedMinutes": 75,
  "isPreview": false,
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course module topic updated",
  "data": {
    "id": 2,
    "courseModuleId": 1,
    "topicId": null,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "courseModuleSlug": "test-module-for-cs",
    "customTitle": "Updated Custom Title",
    "customDescription": "Updated description",
    "topicSlug": null,
    "displayOrder": 3,
    "estimatedMinutes": 75,
    "isPreview": false,
    "note": "Updated instructor note",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T11:00:00.000Z",
    "updatedAt": "2026-04-12T11:15:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module topic 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field (displayOrder, customTitle, customDescription, estimatedMinutes, isPreview, note, isActive) is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — clear customTitle on custom-mode record that becomes invalid

```json
{
  "success": false,
  "message": "Cannot clear customTitle on custom-mode record; at least topicId or customTitle must be present",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update immutable field

```json
{
  "success": false,
  "message": "Fields courseModuleId and topicId are immutable",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate custom title update

```json
{
  "success": false,
  "message": "An active course module topic with title 'Already Taken Title' already exists in module 1",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module_topic.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/course-module-topics/:id`

Soft-delete a course module topic. Only super-admin can soft-delete. The record is marked as deleted but retained in the database. Use POST /:id/restore to recover.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-module-topics/:id` |
| Permission | `course_module_topic.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content — happy path

```
(empty body)
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course module topic 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — already deleted

```json
{
  "success": false,
  "message": "Course module topic 1 is already deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden — only super-admin

```json
{
  "success": false,
  "message": "Missing required permission: course_module_topic.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/course-module-topics/:id/restore`

Restore a soft-deleted course module topic. Admin+ only. Validates that the parent course module has not been deleted and that no duplicate active record exists for the same (courseModuleId, topicId) or (courseModuleId, customTitle) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-module-topics/:id/restore` |
| Permission | `course_module_topic.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course module topic restored",
  "data": {
    "id": 1,
    "courseModuleId": 1,
    "topicId": 3,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "courseModuleSlug": "test-module-for-cs",
    "customTitle": null,
    "customDescription": null,
    "topicSlug": "test-topic-for-cmt",
    "displayOrder": 1,
    "estimatedMinutes": 45,
    "isPreview": false,
    "note": "Core foundational material",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:45:00.000Z"
  }
}
```

#### 404 Not Found — record not found

```json
{
  "success": false,
  "message": "Course module topic 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "Course module topic 1 is not deleted; nothing to restore",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — parent course module deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent course module 1 is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active linked topic exists

```json
{
  "success": false,
  "message": "Cannot restore: an active course module topic for module 1 and topic 3 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active custom topic exists

```json
{
  "success": false,
  "message": "Cannot restore: an active course module topic with title 'Advanced Custom Topic' already exists in module 1",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_module_topic.restore",
  "code": "FORBIDDEN"
}
```

---

## Postman saved examples summary

This endpoint family provides **43+ saved examples** covering:

- **Pagination**: default (pageIndex=0), various page sizes, out-of-range
- **Filtering by courseModuleId**: single module, multiple modules
- **Filtering by topicId**: multiple topics
- **Filtering by hasTopic**: linked mode only, custom mode only
- **Filtering by isPreview & isActive & isDeleted**: preview/non-preview, active/inactive, deleted/non-deleted combinations
- **Search**: course code, course slug, module slug, custom title, topic slug
- **Sorting**: by id, display_order, course_module_id, custom_title, created_at, updated_at (both ASC and DESC)
- **Combined filters & sorts**: e.g., module + topic, module + linked mode, module + display order sort, active + non-deleted + sorted
- **GET by ID**: single topic retrieval (linked and custom modes)
- **POST create**: linked mode minimal, linked mode with all fields, custom mode minimal, custom mode with all fields
- **PATCH update**: individual field updates, clearing text fields, clearing estimated minutes, combined field updates
- **DELETE**: soft-delete request
- **POST restore**: restore after soft-delete
- **Error cases**: 400 (validation: neither/both topicId+customTitle, missing course module, missing topic, duplicate linked/custom, immutable field update, cannot clear required field, no fields to update, restore validations), 403 (forbidden permissions), 404 (not found), 204 (delete success)

Use the **endpoint summary table** above and **saved examples** tables in each section to import these into your Postman collection.
