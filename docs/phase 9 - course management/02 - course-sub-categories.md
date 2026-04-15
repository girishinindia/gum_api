# Phase 9 — Course Sub-Categories

A course-sub-category is a junction table that maps courses to their categorization within the sub-categories taxonomy. Each mapping documents the relationship between a course and a sub-category, including flags for primary designation and display ordering. A course can have multiple sub-categories, but only one can be marked as primary. Sub-categories are referenced from the categorization hierarchy and must not be deleted when linked. Course-sub-category mappings support soft-delete and admin restore. All routes require authentication.

Permission codes: `course_sub_category.read`, `course_sub_category.create`, `course_sub_category.update`, `course_sub_category.delete`, `course_sub_category.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Next →](./03%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-sub-categories) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories` | `course_sub_category.read` | List all course-sub-category mappings with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1course-sub-categoriesid) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories/:id` | `course_sub_category.read` | Get one mapping by ID. |
| [§1.3](#13-post-apiv1course-sub-categories) | `POST` | `{{baseUrl}}/api/v1/course-sub-categories` | `course_sub_category.create` | Create a new course-sub-category mapping. |
| [§1.4](#14-patch-apiv1course-sub-categoriesid) | `PATCH` | `{{baseUrl}}/api/v1/course-sub-categories/:id` | `course_sub_category.update` | Update a mapping by ID. |
| [§1.5](#15-delete-apiv1course-sub-categoriesid) | `DELETE` | `{{baseUrl}}/api/v1/course-sub-categories/:id` | `course_sub_category.delete` | Soft-delete a mapping (SA only). |
| [§1.6](#16-post-apiv1course-sub-categoriesidrestore) | `POST` | `{{baseUrl}}/api/v1/course-sub-categories/:id/restore` | `course_sub_category.restore` | Restore a soft-deleted mapping (admin+ only). |

---

## 1.1 `GET /api/v1/course-sub-categories`

List all course-sub-category mappings with support for pagination, search, filtering, and sorting. Results include denormalized course and sub-category metadata for quick reference.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-sub-categories` |
| Permission | `course_sub_category.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `courseId` | int | — | Filter by course ID. |
| `subCategoryId` | int | — | Filter by sub-category ID. |
| `isPrimary` | bool | — | Filter by primary flag. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted mappings. |
| `searchTerm` | string | — | `ILIKE` across course code, course slug, sub-category code, and sub-category slug. |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `is_primary`, `created_at`, `updated_at`. |
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
      "subCategoryId": 5,
      "isPrimary": true,
      "displayOrder": 1,
      "isActive": true,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "courseCode": "WEB101",
      "courseSlug": "web-development-bootcamp",
      "courseIsActive": true,
      "subCategoryCode": "SCAT-WEB-DEV",
      "subCategorySlug": "scat-web-dev",
      "subCategoryIsActive": true
    },
    {
      "id": 2,
      "courseId": 1,
      "subCategoryId": 8,
      "isPrimary": false,
      "displayOrder": 2,
      "isActive": true,
      "createdAt": "2026-04-11T14:30:00.000Z",
      "updatedAt": "2026-04-11T14:30:00.000Z",
      "courseCode": "WEB101",
      "courseSlug": "web-development-bootcamp",
      "courseIsActive": true,
      "subCategoryCode": "SCAT-JS-ADVANCED",
      "subCategorySlug": "scat-js-advanced",
      "subCategoryIsActive": true
    },
    {
      "id": 3,
      "courseId": 2,
      "subCategoryId": 5,
      "isPrimary": true,
      "displayOrder": 1,
      "isActive": true,
      "createdAt": "2026-04-10T09:15:00.000Z",
      "updatedAt": "2026-04-10T09:15:00.000Z",
      "courseCode": "PYTHON101",
      "courseSlug": "python-for-beginners",
      "courseIsActive": true,
      "subCategoryCode": "SCAT-PYTHON-BASICS",
      "subCategorySlug": "scat-python-basics",
      "subCategoryIsActive": true
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 47, "totalPages": 3 }
}
```

#### 403 Forbidden — caller lacks `course_sub_category.read`

```json
{
  "success": false,
  "message": "Missing required permission: course_sub_category.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/course-sub-categories` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 1 (defaults) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=2&pageSize=20` |
| 3 | Page 3, default size | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=3&pageSize=20` |
| 4 | Page 1, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=1&pageSize=5` |
| 5 | Page 1, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=1&pageSize=10` |
| 6 | Page 1, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=1&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=9999&pageSize=20` |
| 8 | Filter by courseId=1 | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?courseId=1` |
| 9 | Filter by courseId=2 | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?courseId=2` |
| 10 | Filter by subCategoryId=5 | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?subCategoryId=5` |
| 11 | Filter by subCategoryId=8 | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?subCategoryId=8` |
| 12 | Primary only (isPrimary=true) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isPrimary=true` |
| 13 | Secondary only (isPrimary=false) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isPrimary=false` |
| 14 | Active only (isActive=true) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isActive=true` |
| 15 | Inactive only (isActive=false) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isActive=false` |
| 16 | Deleted only (isDeleted=true) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isDeleted=true` |
| 17 | Non-deleted only (isDeleted=false) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isDeleted=false` |
| 18 | Search — "WEB" | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?searchTerm=WEB` |
| 19 | Search — "PYTHON" | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?searchTerm=PYTHON` |
| 20 | Search — "SCAT-JS" | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?searchTerm=SCAT-JS` |
| 21 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=1&pageSize=10&searchTerm=web` |
| 22 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=id&sortDirection=ASC` |
| 23 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=id&sortDirection=DESC` |
| 24 | Sort by `display_order` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=display_order&sortDirection=ASC` |
| 25 | Sort by `display_order` DESC | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=display_order&sortDirection=DESC` |
| 26 | Sort by `is_primary` ASC | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=is_primary&sortDirection=ASC` |
| 27 | Sort by `is_primary` DESC | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=is_primary&sortDirection=DESC` |
| 28 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=created_at&sortDirection=DESC` |
| 29 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=created_at&sortDirection=ASC` |
| 30 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=updated_at&sortDirection=DESC` |
| 31 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?sortColumn=updated_at&sortDirection=ASC` |
| 32 | Combo — courseId=1, primary only | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?courseId=1&isPrimary=true` |
| 33 | Combo — courseId=1, sorted by displayOrder | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?courseId=1&sortColumn=display_order&sortDirection=ASC` |
| 34 | Combo — active, non-deleted, sorted by id | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?isActive=true&isDeleted=false&sortColumn=id&sortDirection=ASC` |
| 35 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/course-sub-categories?pageIndex=1&pageSize=10&searchTerm=web&courseId=1&isPrimary=true&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/course-sub-categories/:id`

Get one course-sub-category mapping by ID, including all denormalized course and sub-category metadata.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-sub-categories/:id` |
| Permission | `course_sub_category.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full course-sub-category mapping object with denormalized metadata.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseId": 1,
    "subCategoryId": 5,
    "isPrimary": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "courseIsActive": true,
    "subCategoryCode": "SCAT-WEB-DEV",
    "subCategorySlug": "scat-web-dev",
    "subCategoryIsActive": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-sub-category mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_sub_category.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/course-sub-categories`

Create a new course-sub-category mapping. Both the course and sub-category must exist and not be deleted. Only one mapping per course can have `isPrimary=true`. No duplicate active mappings are allowed for the same (courseId, subCategoryId) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-sub-categories` |
| Permission | `course_sub_category.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | yes | Foreign key to courses table. Course must exist and not be deleted. |
| `subCategoryId` | int | yes | Foreign key to sub_categories table. Sub-category must exist and not be deleted. |
| `isPrimary` | bool | no | Mark as primary sub-category for this course. Defaults to `false`. Only one primary per course. |
| `displayOrder` | int | no | Display order for UI rendering. Defaults to `0`. |
| `isActive` | bool | no | Defaults to `true`. |

### Sample request — basic mapping

```json
{
  "courseId": 1,
  "subCategoryId": 5
}
```

### Sample request — with primary and display order

```json
{
  "courseId": 1,
  "subCategoryId": 5,
  "isPrimary": true,
  "displayOrder": 1,
  "isActive": true
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Course-sub-category mapping created",
  "data": {
    "id": 1,
    "courseId": 1,
    "subCategoryId": 5,
    "isPrimary": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "courseIsActive": true,
    "subCategoryCode": "SCAT-WEB-DEV",
    "subCategorySlug": "scat-web-dev",
    "subCategoryIsActive": true
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

#### 400 Bad Request — validation error (sub-category does not exist)

```json
{
  "success": false,
  "message": "Sub-category 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "An active mapping for course 1 and sub-category 5 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — primary conflict

```json
{
  "success": false,
  "message": "Course 1 already has a primary sub-category. Unset isPrimary on the existing mapping first",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_sub_category.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/course-sub-categories/:id`

Update a course-sub-category mapping. At least one field must be provided. If setting `isPrimary=true`, validates no other mapping for this course has that flag.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-sub-categories/:id` |
| Permission | `course_sub_category.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `isPrimary` | bool | Mark as primary sub-category for this course. If `true`, unsets primary flag on other mappings for the same course. |
| `displayOrder` | int | Display order for UI rendering. |
| `isActive` | bool | Active flag. |

### Sample request — update displayOrder

```json
{
  "displayOrder": 2
}
```

### Sample request — set as primary

```json
{
  "isPrimary": true
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
  "isPrimary": false,
  "displayOrder": 3,
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-sub-category mapping updated",
  "data": {
    "id": 1,
    "courseId": 1,
    "subCategoryId": 5,
    "isPrimary": false,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:15:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "courseIsActive": true,
    "subCategoryCode": "SCAT-WEB-DEV",
    "subCategorySlug": "scat-web-dev",
    "subCategoryIsActive": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-sub-category mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field (isPrimary, displayOrder, isActive) is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — primary conflict

```json
{
  "success": false,
  "message": "Course 1 already has another primary sub-category",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_sub_category.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/course-sub-categories/:id`

Soft-delete a course-sub-category mapping. Only super-admin can soft-delete. The mapping is marked as deleted but retained in the database. Use POST /:id/restore to recover.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-sub-categories/:id` |
| Permission | `course_sub_category.delete` |

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
  "message": "Course-sub-category mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — only super-admin

```json
{
  "success": false,
  "message": "Missing required permission: course_sub_category.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/course-sub-categories/:id/restore`

Restore a soft-deleted course-sub-category mapping. Admin+ only. Validates that the parent course has not been deleted and that no duplicate active mapping exists for the same (courseId, subCategoryId) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-sub-categories/:id/restore` |
| Permission | `course_sub_category.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-sub-category mapping restored",
  "data": {
    "id": 1,
    "courseId": 1,
    "subCategoryId": 5,
    "isPrimary": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:30:00.000Z",
    "courseCode": "WEB101",
    "courseSlug": "web-development-bootcamp",
    "courseIsActive": true,
    "subCategoryCode": "SCAT-WEB-DEV",
    "subCategorySlug": "scat-web-dev",
    "subCategoryIsActive": true
  }
}
```

#### 404 Not Found — mapping not found

```json
{
  "success": false,
  "message": "Course-sub-category mapping 999 not found",
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

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "Cannot restore: an active mapping for course 1 and sub-category 5 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_sub_category.restore",
  "code": "FORBIDDEN"
}
```

---

## Postman saved examples summary

This endpoint family provides **35+ saved examples** covering:

- **Pagination**: default, various page sizes, out-of-range
- **Filtering by courseId**: single course, multiple courses
- **Filtering by subCategoryId**: multiple sub-categories
- **Filtering by isPrimary**: primary only, secondary only
- **Filtering by isActive & isDeleted**: active/inactive, deleted/non-deleted combinations
- **Search**: course code, course slug, sub-category code, sub-category slug
- **Sorting**: by id, display_order, is_primary, created_at, updated_at (both ASC and DESC)
- **Combined filters & sorts**: e.g., course + primary + display order sort, search + filter + sort + paginate
- **GET by ID**: single mapping retrieval
- **POST create**: basic, with primary, with displayOrder, with multiple fields
- **PATCH update**: each individual field, combined field updates
- **DELETE**: soft-delete request
- **POST restore**: restore after soft-delete
- **Error cases**: 404 (not found), 400 (validation: missing course, missing sub-category, duplicate mapping, primary conflict, no fields to update), 403 (forbidden permissions)

Use the **endpoint summary table** above and **saved examples** tables in each section to import these into your Postman collection.
