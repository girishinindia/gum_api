# Phase 9 — Course Chapters

A course-chapter is a junction table that maps course-subjects to chapters. Each mapping documents the relationship between a course-subject and a chapter, including display ordering and free-trial accessibility. A course-subject can have multiple chapters ordered by display sequence. Chapters are referenced from the chapter taxonomy and must not be deleted when linked. Course-chapter mappings support soft-delete and admin restore. All routes require authentication.

Permission codes: `course_chapter.read`, `course_chapter.create`, `course_chapter.update`, `course_chapter.delete`, `course_chapter.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Previous](./04%20-%20course-subjects.md) · [Next →](./06%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-chapters) | `GET` | `{{baseUrl}}/api/v1/course-chapters` | `course_chapter.read` | List all course-chapter mappings with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1course-chaptersid) | `GET` | `{{baseUrl}}/api/v1/course-chapters/:id` | `course_chapter.read` | Get one mapping by ID. |
| [§1.3](#13-post-apiv1course-chapters) | `POST` | `{{baseUrl}}/api/v1/course-chapters` | `course_chapter.create` | Create a new course-chapter mapping. |
| [§1.4](#14-patch-apiv1course-chaptersid) | `PATCH` | `{{baseUrl}}/api/v1/course-chapters/:id` | `course_chapter.update` | Update a mapping by ID. |
| [§1.5](#15-delete-apiv1course-chaptersid) | `DELETE` | `{{baseUrl}}/api/v1/course-chapters/:id` | `course_chapter.delete` | Soft-delete a mapping (SA only). |
| [§1.6](#16-post-apiv1course-chaptersidrestore) | `POST` | `{{baseUrl}}/api/v1/course-chapters/:id/restore` | `course_chapter.restore` | Restore a soft-deleted mapping (admin+ only). |

---

## 1.1 `GET /api/v1/course-chapters`

List all course-chapter mappings with support for pagination, search, filtering, and sorting. Results include denormalized course, module, subject, and chapter metadata for quick reference.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-chapters` |
| Permission | `course_chapter.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `0` | 0-based page number. |
| `pageSize` | int | `25` | 1..100. |
| `courseSubjectId` | int | — | Filter by course-subject ID. |
| `chapterId` | int | — | Filter by chapter ID. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | `false` | Include/exclude soft-deleted mappings. Defaults to false. |
| `searchTerm` | string | — | `ILIKE` across chapter code, chapter slug. |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `course_subject_id`, `chapter_id`, `created_at`, `updated_at`. |
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
      "courseSubjectId": 1,
      "chapterId": 4,
      "displayOrder": 1,
      "isFreeTrial": false,
      "note": "Core chapter for subject introduction",
      "isActive": true,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "courseId": 1,
      "moduleId": 1,
      "subjectId": 9,
      "chapterSlug": "html-fundamentals"
    },
    {
      "id": 2,
      "courseSubjectId": 1,
      "chapterId": 5,
      "displayOrder": 2,
      "isFreeTrial": true,
      "note": "Free preview chapter",
      "isActive": true,
      "createdAt": "2026-04-11T14:30:00.000Z",
      "updatedAt": "2026-04-11T14:30:00.000Z",
      "courseId": 1,
      "moduleId": 1,
      "subjectId": 9,
      "chapterSlug": "html-advanced"
    },
    {
      "id": 3,
      "courseSubjectId": 1,
      "chapterId": 6,
      "displayOrder": 3,
      "isFreeTrial": false,
      "note": null,
      "isActive": true,
      "createdAt": "2026-04-10T09:15:00.000Z",
      "updatedAt": "2026-04-10T09:15:00.000Z",
      "courseId": 1,
      "moduleId": 1,
      "subjectId": 9,
      "chapterSlug": "html-best-practices"
    }
  ],
  "meta": { "page": 0, "limit": 25, "totalCount": 47, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `course_chapter.read`

```json
{
  "success": false,
  "message": "Missing required permission: course_chapter.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/course-chapters` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 0 (defaults) | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=0&pageSize=25` |
| 2 | Page 1, default size | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=1&pageSize=25` |
| 3 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=2&pageSize=25` |
| 4 | Page 0, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=0&pageSize=5` |
| 5 | Page 0, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=0&pageSize=10` |
| 6 | Page 0, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=0&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=9999&pageSize=25` |
| 8 | Filter by courseSubjectId=1 | `GET` | `{{baseUrl}}/api/v1/course-chapters?courseSubjectId=1` |
| 9 | Filter by courseSubjectId=2 | `GET` | `{{baseUrl}}/api/v1/course-chapters?courseSubjectId=2` |
| 10 | Filter by chapterId=4 | `GET` | `{{baseUrl}}/api/v1/course-chapters?chapterId=4` |
| 11 | Filter by chapterId=5 | `GET` | `{{baseUrl}}/api/v1/course-chapters?chapterId=5` |
| 12 | Free trial only (isFreeTrial=true) | `GET` | `{{baseUrl}}/api/v1/course-chapters?isFreeTrial=true` |
| 13 | Non-free-trial only (isFreeTrial=false) | `GET` | `{{baseUrl}}/api/v1/course-chapters?isFreeTrial=false` |
| 14 | Active only (isActive=true) | `GET` | `{{baseUrl}}/api/v1/course-chapters?isActive=true` |
| 15 | Inactive only (isActive=false) | `GET` | `{{baseUrl}}/api/v1/course-chapters?isActive=false` |
| 16 | Deleted only (isDeleted=true) | `GET` | `{{baseUrl}}/api/v1/course-chapters?isDeleted=true` |
| 17 | Non-deleted only (isDeleted=false) | `GET` | `{{baseUrl}}/api/v1/course-chapters?isDeleted=false` |
| 18 | Search — "html" | `GET` | `{{baseUrl}}/api/v1/course-chapters?searchTerm=html` |
| 19 | Search — "fundamentals" | `GET` | `{{baseUrl}}/api/v1/course-chapters?searchTerm=fundamentals` |
| 20 | Search — "chapter" | `GET` | `{{baseUrl}}/api/v1/course-chapters?searchTerm=chapter` |
| 21 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=0&pageSize=10&searchTerm=html` |
| 22 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=id&sortDirection=ASC` |
| 23 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=id&sortDirection=DESC` |
| 24 | Sort by `display_order` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=display_order&sortDirection=ASC` |
| 25 | Sort by `display_order` DESC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=display_order&sortDirection=DESC` |
| 26 | Sort by `course_subject_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=course_subject_id&sortDirection=ASC` |
| 27 | Sort by `course_subject_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=course_subject_id&sortDirection=DESC` |
| 28 | Sort by `chapter_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=chapter_id&sortDirection=ASC` |
| 29 | Sort by `chapter_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=chapter_id&sortDirection=DESC` |
| 30 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=created_at&sortDirection=DESC` |
| 31 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=created_at&sortDirection=ASC` |
| 32 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=updated_at&sortDirection=DESC` |
| 33 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/course-chapters?sortColumn=updated_at&sortDirection=ASC` |
| 34 | Combo — courseSubjectId=1, chapterId=4 | `GET` | `{{baseUrl}}/api/v1/course-chapters?courseSubjectId=1&chapterId=4` |
| 35 | Combo — courseSubjectId=1, sorted by displayOrder | `GET` | `{{baseUrl}}/api/v1/course-chapters?courseSubjectId=1&sortColumn=display_order&sortDirection=ASC` |
| 36 | Combo — active, non-deleted, sorted by id | `GET` | `{{baseUrl}}/api/v1/course-chapters?isActive=true&isDeleted=false&sortColumn=id&sortDirection=ASC` |
| 37 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/course-chapters?pageIndex=0&pageSize=10&searchTerm=html&courseSubjectId=1&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/course-chapters/:id`

Get one course-chapter mapping by ID, including all denormalized course, module, subject, and chapter metadata.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-chapters/:id` |
| Permission | `course_chapter.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full course-chapter mapping object with denormalized metadata.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseSubjectId": 1,
    "chapterId": 4,
    "displayOrder": 1,
    "isFreeTrial": false,
    "note": "Core chapter for subject introduction",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "chapterSlug": "html-fundamentals"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-chapter mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_chapter.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/course-chapters`

Create a new course-chapter mapping. The course-subject and chapter must both exist and not be deleted. No duplicate active mappings are allowed for the same (courseSubjectId, chapterId) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-chapters` |
| Permission | `course_chapter.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseSubjectId` | int | yes | Foreign key to course-subjects table. Course-subject must exist and not be deleted. |
| `chapterId` | int | yes | Foreign key to chapters table. Chapter must exist and not be deleted. |
| `displayOrder` | int | no | Display order for UI rendering. Defaults to `0`. Minimum value 0. |
| `isFreeTrial` | bool | no | Whether chapter is accessible without purchase. Defaults to `false`. |
| `note` | string | no | Optional note about this mapping. Maximum 10000 characters. Defaults to `null`. |
| `isActive` | bool | no | Defaults to `true`. |

### Sample request — basic mapping

```json
{
  "courseSubjectId": 1,
  "chapterId": 4
}
```

### Sample request — with displayOrder and isFreeTrial

```json
{
  "courseSubjectId": 1,
  "chapterId": 4,
  "displayOrder": 1,
  "isFreeTrial": false
}
```

### Sample request — with note and isFreeTrial

```json
{
  "courseSubjectId": 1,
  "chapterId": 4,
  "displayOrder": 1,
  "isFreeTrial": true,
  "note": "Free preview chapter for trial users",
  "isActive": true
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Course-chapter mapping created",
  "data": {
    "id": 1,
    "courseSubjectId": 1,
    "chapterId": 4,
    "displayOrder": 1,
    "isFreeTrial": false,
    "note": "Core chapter for subject introduction",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "chapterSlug": "html-fundamentals"
  }
}
```

#### 400 Bad Request — validation error (course-subject does not exist)

```json
{
  "success": false,
  "message": "Course-subject 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — validation error (chapter does not exist)

```json
{
  "success": false,
  "message": "Chapter 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "An active mapping for course-subject 1 and chapter 4 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_chapter.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/course-chapters/:id`

Update a course-chapter mapping. At least one field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-chapters/:id` |
| Permission | `course_chapter.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | Display order for UI rendering. Minimum value 0. |
| `isFreeTrial` | bool | Whether chapter is accessible without purchase. |
| `note` | string | Optional note about this mapping. Maximum 10000 characters. Pass empty string to clear. |
| `isActive` | bool | Active flag. |

### Sample request — update displayOrder

```json
{
  "displayOrder": 2
}
```

### Sample request — mark as free trial

```json
{
  "isFreeTrial": true
}
```

### Sample request — add note

```json
{
  "note": "Updated note for this chapter mapping"
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
  "isFreeTrial": true,
  "note": "Revised chapter mapping",
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-chapter mapping updated",
  "data": {
    "id": 1,
    "courseSubjectId": 1,
    "chapterId": 4,
    "displayOrder": 2,
    "isFreeTrial": true,
    "note": "Updated note for this chapter mapping",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:15:00.000Z",
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "chapterSlug": "html-fundamentals"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-chapter mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field (displayOrder, isFreeTrial, note, isActive) is required",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_chapter.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/course-chapters/:id`

Soft-delete a course-chapter mapping. Only super-admin can soft-delete. The mapping is marked as deleted but retained in the database. Use POST /:id/restore to recover.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-chapters/:id` |
| Permission | `course_chapter.delete` |

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
  "message": "Course-chapter mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — only super-admin

```json
{
  "success": false,
  "message": "Missing required permission: course_chapter.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/course-chapters/:id/restore`

Restore a soft-deleted course-chapter mapping. Admin+ only. Validates that the parent course-subject has not been deleted and that no duplicate active mapping exists for the same (courseSubjectId, chapterId) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-chapters/:id/restore` |
| Permission | `course_chapter.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-chapter mapping restored",
  "data": {
    "id": 1,
    "courseSubjectId": 1,
    "chapterId": 4,
    "displayOrder": 1,
    "isFreeTrial": false,
    "note": "Core chapter for subject introduction",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:30:00.000Z",
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "chapterSlug": "html-fundamentals"
  }
}
```

#### 404 Not Found — mapping not found

```json
{
  "success": false,
  "message": "Course-chapter mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — mapping not deleted

```json
{
  "success": false,
  "message": "Mapping 1 is not deleted; nothing to restore",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — parent course-subject deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent course-subject 1 is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "Cannot restore: an active mapping for course-subject 1 and chapter 4 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_chapter.restore",
  "code": "FORBIDDEN"
}
```

---

## Postman saved examples summary

This endpoint family provides **37+ saved examples** covering:

- **Pagination**: default (pageIndex=0), various page sizes, out-of-range
- **Filtering by courseSubjectId**: single course-subject, multiple course-subjects
- **Filtering by chapterId**: multiple chapters
- **Filtering by isFreeTrial & isActive & isDeleted**: free-trial/paid, active/inactive, deleted/non-deleted combinations
- **Search**: chapter code, chapter slug
- **Sorting**: by id, display_order, course_subject_id, chapter_id, created_at, updated_at (both ASC and DESC)
- **Combined filters & sorts**: e.g., course-subject + chapter, course-subject + display order sort, search + filter + sort + paginate
- **GET by ID**: single mapping retrieval
- **POST create**: basic, with displayOrder, with isFreeTrial, with note, with multiple fields
- **PATCH update**: each individual field, clearing note, combined field updates
- **DELETE**: soft-delete request
- **POST restore**: restore after soft-delete
- **Error cases**: 404 (not found), 400 (validation: missing course-subject, missing chapter, duplicate mapping, no fields to update, restore validations), 403 (forbidden permissions)

Use the **endpoint summary table** above and **saved examples** tables in each section to import these into your Postman collection.
