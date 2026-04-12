# Phase 9 — Course Subjects

A course-subject is a junction table that maps courses to subjects through their modules. Each mapping documents the relationship between a course, its module, and a subject, including display ordering. A course can have multiple subjects across different modules. Subjects are referenced from the subject taxonomy and must not be deleted when linked. Course-subject mappings support soft-delete and admin restore. All routes require authentication.

Permission codes: `course_subject.read`, `course_subject.create`, `course_subject.update`, `course_subject.delete`, `course_subject.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Previous](./03%20-%20lessons.md) · [Next →](./05%20-%20lessons-subjects.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-subjects) | `GET` | `{{baseUrl}}/api/v1/course-subjects` | `course_subject.read` | List all course-subject mappings with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1course-subjectsid) | `GET` | `{{baseUrl}}/api/v1/course-subjects/:id` | `course_subject.read` | Get one mapping by ID. |
| [§1.3](#13-post-apiv1course-subjects) | `POST` | `{{baseUrl}}/api/v1/course-subjects` | `course_subject.create` | Create a new course-subject mapping. |
| [§1.4](#14-patch-apiv1course-subjectsid) | `PATCH` | `{{baseUrl}}/api/v1/course-subjects/:id` | `course_subject.update` | Update a mapping by ID. |
| [§1.5](#15-delete-apiv1course-subjectsid) | `DELETE` | `{{baseUrl}}/api/v1/course-subjects/:id` | `course_subject.delete` | Soft-delete a mapping (SA only). |
| [§1.6](#16-post-apiv1course-subjectsidrestore) | `POST` | `{{baseUrl}}/api/v1/course-subjects/:id/restore` | `course_subject.restore` | Restore a soft-deleted mapping (admin+ only). |

---

## 1.1 `GET /api/v1/course-subjects`

List all course-subject mappings with support for pagination, search, filtering, and sorting. Results include denormalized course, module, and subject metadata for quick reference.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-subjects` |
| Permission | `course_subject.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `0` | 0-based page number. |
| `pageSize` | int | `25` | 1..100. |
| `courseId` | int | — | Filter by course ID. |
| `moduleId` | int | — | Filter by module ID. |
| `subjectId` | int | — | Filter by subject ID. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | `false` | Include/exclude soft-deleted mappings. Defaults to false. |
| `searchTerm` | string | — | `ILIKE` across course code, course slug, module slug, subject code, and subject slug. |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `course_id`, `module_id`, `subject_id`, `created_at`, `updated_at`. |
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
      "courseId": 1,
      "moduleId": 1,
      "subjectId": 9,
      "displayOrder": 1,
      "note": "Core subject for module introduction",
      "isActive": true,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "courseCode": "WEB101",
      "courseSlug": "web-development-bootcamp",
      "moduleSlug": "web-foundations",
      "subjectCode": "SUB-HTML",
      "subjectSlug": "html-basics"
    },
    {
      "id": 2,
      "courseId": 1,
      "moduleId": 1,
      "subjectId": 10,
      "displayOrder": 2,
      "note": "Essential CSS concepts",
      "isActive": true,
      "createdAt": "2026-04-11T14:30:00.000Z",
      "updatedAt": "2026-04-11T14:30:00.000Z",
      "courseCode": "WEB101",
      "courseSlug": "web-development-bootcamp",
      "moduleSlug": "web-foundations",
      "subjectCode": "SUB-CSS",
      "subjectSlug": "css-fundamentals"
    },
    {
      "id": 3,
      "courseId": 1,
      "moduleId": 1,
      "subjectId": 11,
      "displayOrder": 3,
      "note": null,
      "isActive": true,
      "createdAt": "2026-04-10T09:15:00.000Z",
      "updatedAt": "2026-04-10T09:15:00.000Z",
      "courseCode": "WEB101",
      "courseSlug": "web-development-bootcamp",
      "moduleSlug": "web-foundations",
      "subjectCode": "SUB-JS",
      "subjectSlug": "javascript-intro"
    }
  ],
  "meta": { "page": 0, "limit": 25, "totalCount": 47, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `course_subject.read`

```json
{
  "success": false,
  "message": "Missing required permission: course_subject.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/course-subjects` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 0 (defaults) | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=0&pageSize=25` |
| 2 | Page 1, default size | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=1&pageSize=25` |
| 3 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=2&pageSize=25` |
| 4 | Page 0, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=0&pageSize=5` |
| 5 | Page 0, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=0&pageSize=10` |
| 6 | Page 0, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=0&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=9999&pageSize=25` |
| 8 | Filter by courseId=1 | `GET` | `{{baseUrl}}/api/v1/course-subjects?courseId=1` |
| 9 | Filter by courseId=2 | `GET` | `{{baseUrl}}/api/v1/course-subjects?courseId=2` |
| 10 | Filter by moduleId=1 | `GET` | `{{baseUrl}}/api/v1/course-subjects?moduleId=1` |
| 11 | Filter by moduleId=2 | `GET` | `{{baseUrl}}/api/v1/course-subjects?moduleId=2` |
| 12 | Filter by subjectId=9 | `GET` | `{{baseUrl}}/api/v1/course-subjects?subjectId=9` |
| 13 | Filter by subjectId=10 | `GET` | `{{baseUrl}}/api/v1/course-subjects?subjectId=10` |
| 14 | Active only (isActive=true) | `GET` | `{{baseUrl}}/api/v1/course-subjects?isActive=true` |
| 15 | Inactive only (isActive=false) | `GET` | `{{baseUrl}}/api/v1/course-subjects?isActive=false` |
| 16 | Deleted only (isDeleted=true) | `GET` | `{{baseUrl}}/api/v1/course-subjects?isDeleted=true` |
| 17 | Non-deleted only (isDeleted=false) | `GET` | `{{baseUrl}}/api/v1/course-subjects?isDeleted=false` |
| 18 | Search — "WEB" | `GET` | `{{baseUrl}}/api/v1/course-subjects?searchTerm=WEB` |
| 19 | Search — "HTML" | `GET` | `{{baseUrl}}/api/v1/course-subjects?searchTerm=HTML` |
| 20 | Search — "foundations" | `GET` | `{{baseUrl}}/api/v1/course-subjects?searchTerm=foundations` |
| 21 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=0&pageSize=10&searchTerm=web` |
| 22 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=id&sortDirection=ASC` |
| 23 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=id&sortDirection=DESC` |
| 24 | Sort by `display_order` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=display_order&sortDirection=ASC` |
| 25 | Sort by `display_order` DESC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=display_order&sortDirection=DESC` |
| 26 | Sort by `course_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=course_id&sortDirection=ASC` |
| 27 | Sort by `course_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=course_id&sortDirection=DESC` |
| 28 | Sort by `module_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=module_id&sortDirection=ASC` |
| 29 | Sort by `module_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=module_id&sortDirection=DESC` |
| 30 | Sort by `subject_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=subject_id&sortDirection=ASC` |
| 31 | Sort by `subject_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=subject_id&sortDirection=DESC` |
| 32 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=created_at&sortDirection=DESC` |
| 33 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=created_at&sortDirection=ASC` |
| 34 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=updated_at&sortDirection=DESC` |
| 35 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/course-subjects?sortColumn=updated_at&sortDirection=ASC` |
| 36 | Combo — courseId=1, moduleId=1 | `GET` | `{{baseUrl}}/api/v1/course-subjects?courseId=1&moduleId=1` |
| 37 | Combo — courseId=1, sorted by displayOrder | `GET` | `{{baseUrl}}/api/v1/course-subjects?courseId=1&sortColumn=display_order&sortDirection=ASC` |
| 38 | Combo — active, non-deleted, sorted by id | `GET` | `{{baseUrl}}/api/v1/course-subjects?isActive=true&isDeleted=false&sortColumn=id&sortDirection=ASC` |
| 39 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/course-subjects?pageIndex=0&pageSize=10&searchTerm=web&courseId=1&moduleId=1&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/course-subjects/:id`

Get one course-subject mapping by ID, including all denormalized course, module, and subject metadata.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-subjects/:id` |
| Permission | `course_subject.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full course-subject mapping object with denormalized metadata.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "displayOrder": 1,
    "note": "Core subject for module introduction",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "moduleSlug": "web-foundations",
    "subjectCode": "SUB-HTML",
    "subjectSlug": "html-basics"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-subject mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_subject.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/course-subjects`

Create a new course-subject mapping. The course, module, and subject must all exist and not be deleted. The module must belong to the specified course. No duplicate active mappings are allowed for the same (courseId, moduleId, subjectId) triple.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-subjects` |
| Permission | `course_subject.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | yes | Foreign key to courses table. Course must exist and not be deleted. |
| `moduleId` | int | yes | Foreign key to modules table. Module must exist, not be deleted, and belong to the specified course. |
| `subjectId` | int | yes | Foreign key to subjects table. Subject must exist and not be deleted. |
| `displayOrder` | int | no | Display order for UI rendering. Defaults to `0`. Minimum value 0. |
| `note` | string | no | Optional note about this mapping. Maximum 10000 characters. Defaults to `null`. |
| `isActive` | bool | no | Defaults to `true`. |

### Sample request — basic mapping

```json
{
  "courseId": 1,
  "moduleId": 1,
  "subjectId": 9
}
```

### Sample request — with displayOrder and note

```json
{
  "courseId": 1,
  "moduleId": 1,
  "subjectId": 9,
  "displayOrder": 1,
  "note": "Core subject for module introduction",
  "isActive": true
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Course-subject mapping created",
  "data": {
    "id": 1,
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "displayOrder": 1,
    "note": "Core subject for module introduction",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "moduleSlug": "web-foundations",
    "subjectCode": "SUB-HTML",
    "subjectSlug": "html-basics"
  }
}
```

#### 400 Bad Request — validation error (course does not exist)

```json
{
  "success": false,
  "message": "Course 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — validation error (module does not exist)

```json
{
  "success": false,
  "message": "Module 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — validation error (module does not belong to course)

```json
{
  "success": false,
  "message": "Module 2 does not belong to course 1",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — validation error (subject does not exist)

```json
{
  "success": false,
  "message": "Subject 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "An active mapping for course 1, module 1, and subject 9 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_subject.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/course-subjects/:id`

Update a course-subject mapping. At least one field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-subjects/:id` |
| Permission | `course_subject.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | Display order for UI rendering. Minimum value 0. |
| `note` | string | Optional note about this mapping. Maximum 10000 characters. Pass empty string to clear. |
| `isActive` | bool | Active flag. |

### Sample request — update displayOrder

```json
{
  "displayOrder": 2
}
```

### Sample request — add note

```json
{
  "note": "Updated note for this subject mapping"
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
  "note": "Revised subject mapping",
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-subject mapping updated",
  "data": {
    "id": 1,
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "displayOrder": 2,
    "note": "Updated note for this subject mapping",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:15:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "moduleSlug": "web-foundations",
    "subjectCode": "SUB-HTML",
    "subjectSlug": "html-basics"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-subject mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field (displayOrder, note, isActive) is required",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_subject.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/course-subjects/:id`

Soft-delete a course-subject mapping. Only super-admin can soft-delete. The mapping is marked as deleted but retained in the database. Use POST /:id/restore to recover.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-subjects/:id` |
| Permission | `course_subject.delete` |

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
  "message": "Course-subject mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — only super-admin

```json
{
  "success": false,
  "message": "Missing required permission: course_subject.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/course-subjects/:id/restore`

Restore a soft-deleted course-subject mapping. Admin+ only. Validates that the parent course and module have not been deleted and that no duplicate active mapping exists for the same (courseId, moduleId, subjectId) triple.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-subjects/:id/restore` |
| Permission | `course_subject.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-subject mapping restored",
  "data": {
    "id": 1,
    "courseId": 1,
    "moduleId": 1,
    "subjectId": 9,
    "displayOrder": 1,
    "note": "Core subject for module introduction",
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:30:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "moduleSlug": "web-foundations",
    "subjectCode": "SUB-HTML",
    "subjectSlug": "html-basics"
  }
}
```

#### 404 Not Found — mapping not found

```json
{
  "success": false,
  "message": "Course-subject mapping 999 not found",
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

#### 400 Bad Request — parent course deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent course 1 is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — parent module deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent module 1 is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "Cannot restore: an active mapping for course 1, module 1, and subject 9 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_subject.restore",
  "code": "FORBIDDEN"
}
```

---

## Postman saved examples summary

This endpoint family provides **39+ saved examples** covering:

- **Pagination**: default (pageIndex=0), various page sizes, out-of-range
- **Filtering by courseId**: single course, multiple courses
- **Filtering by moduleId**: single module, multiple modules
- **Filtering by subjectId**: multiple subjects
- **Filtering by isActive & isDeleted**: active/inactive, deleted/non-deleted combinations
- **Search**: course code, course slug, module slug, subject code, subject slug
- **Sorting**: by id, display_order, course_id, module_id, subject_id, created_at, updated_at (both ASC and DESC)
- **Combined filters & sorts**: e.g., course + module + display order sort, search + filter + sort + paginate
- **GET by ID**: single mapping retrieval
- **POST create**: basic, with displayOrder, with note, with multiple fields
- **PATCH update**: each individual field, clearing note, combined field updates
- **DELETE**: soft-delete request
- **POST restore**: restore after soft-delete
- **Error cases**: 404 (not found), 400 (validation: missing course, missing module, module not belonging to course, missing subject, duplicate mapping, no fields to update, restore validations), 403 (forbidden permissions)

Use the **endpoint summary table** above and **saved examples** tables in each section to import these into your Postman collection.
