# Phase 9 — Bundle-Courses

Bundle-courses represent the junction mappings between bundles and the courses that belong to them. Each bundle-course record links a course to a bundle and tracks the course's display order within that bundle, active status, and audit timestamps. Bundle-courses support soft-delete and admin restore. All routes require authentication.

Permission codes: `bundle_course.read`, `bundle_course.create`, `bundle_course.update`, `bundle_course.delete`, `bundle_course.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor**: `read`, `create`, `update` on own bundles only; no delete/restore.
- **Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Previous](./08%20-%20bundles.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1bundle-courses) | `GET` | `{{baseUrl}}/api/v1/bundle-courses` | `bundle_course.read` | List all bundle-course mappings with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1bundle-coursesid) | `GET` | `{{baseUrl}}/api/v1/bundle-courses/:id` | `bundle_course.read` | Get one bundle-course by ID (includes soft-deleted records). |
| [§1.3](#13-post-apiv1bundle-courses) | `POST` | `{{baseUrl}}/api/v1/bundle-courses` | `bundle_course.create` | Create a new bundle-course mapping. |
| [§1.4](#14-patch-apiv1bundle-coursesid) | `PATCH` | `{{baseUrl}}/api/v1/bundle-courses/:id` | `bundle_course.update` | Update a bundle-course mapping by ID. |
| [§1.5](#15-delete-apiv1bundle-coursesid) | `DELETE` | `{{baseUrl}}/api/v1/bundle-courses/:id` | `bundle_course.delete` | Soft-delete a bundle-course mapping. |
| [§1.6](#16-post-apiv1bundle-coursesidrestore) | `POST` | `{{baseUrl}}/api/v1/bundle-courses/:id/restore` | `bundle_course.restore` | Restore a soft-deleted bundle-course mapping. |

---

## 1.1 `GET /api/v1/bundle-courses`

List all bundle-course mappings with support for pagination, search, filtering, and sorting. Results include denormalized bundle and course metadata (code, slug, price).

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/bundle-courses` |
| Permission | `bundle_course.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `20` | 1..500. |
| `bundleId` | int | — | Filter by bundle_courses.bundleId. |
| `courseId` | int | — | Filter by bundle_courses.courseId. |
| `isActive` | bool | — | Filter by active flag. |
| `searchTerm` | string | — | `ILIKE` across bundle code, slug, course code, and course slug. |
| `sortColumn` | enum | `display_order` | `id`, `bundle_id`, `course_id`, `display_order`, `created_at`, `updated_at`. |
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
      "bundleId": 1,
      "courseId": 101,
      "bundleCode": "BUNDLE-TEST-01",
      "bundleSlug": "bundle-test-01",
      "bundlePrice": 119.99,
      "courseCode": "TC-CS-01",
      "courseSlug": "test-course-for-cs",
      "coursePrice": 0,
      "displayOrder": 1,
      "isActive": true,
      "createdAt": "2026-04-12T11:18:42.447Z"
    },
    {
      "id": 2,
      "bundleId": 1,
      "courseId": 102,
      "bundleCode": "BUNDLE-TEST-01",
      "bundleSlug": "bundle-test-01",
      "bundlePrice": 119.99,
      "courseCode": "TC-ADV-02",
      "courseSlug": "test-course-advanced-02",
      "coursePrice": 29.99,
      "displayOrder": 2,
      "isActive": true,
      "createdAt": "2026-04-12T11:19:15.820Z"
    },
    {
      "id": 3,
      "bundleId": 2,
      "courseId": 103,
      "bundleCode": "INST-BUNDLE-01",
      "bundleSlug": "inst-bundle-01",
      "bundlePrice": 149.99,
      "courseCode": "WEB-001",
      "courseSlug": "web-development-101",
      "coursePrice": 49.99,
      "displayOrder": 1,
      "isActive": true,
      "createdAt": "2026-04-12T11:20:33.105Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 12, "totalPages": 1 }
}
```

#### 403 Forbidden — caller lacks `bundle_course.read`

```json
{
  "success": false,
  "message": "Missing required permission: bundle_course.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **filtering**, **searching**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/bundle-courses` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 1 (defaults) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/bundle-courses?pageIndex=2&pageSize=20` |
| 3 | Page 1, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?pageIndex=1&pageSize=5` |
| 4 | Page 1, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?pageIndex=1&pageSize=100` |
| 5 | Filter by bundleId=1 | `GET` | `{{baseUrl}}/api/v1/bundle-courses?bundleId=1` |
| 6 | Filter by bundleId=2 | `GET` | `{{baseUrl}}/api/v1/bundle-courses?bundleId=2` |
| 7 | Filter by courseId=101 | `GET` | `{{baseUrl}}/api/v1/bundle-courses?courseId=101` |
| 8 | Filter by courseId=102 | `GET` | `{{baseUrl}}/api/v1/bundle-courses?courseId=102` |
| 9 | Filter by isActive=true | `GET` | `{{baseUrl}}/api/v1/bundle-courses?isActive=true` |
| 10 | Filter by isActive=false | `GET` | `{{baseUrl}}/api/v1/bundle-courses?isActive=false` |
| 11 | Search — "BUNDLE-TEST-01" | `GET` | `{{baseUrl}}/api/v1/bundle-courses?searchTerm=BUNDLE-TEST-01` |
| 12 | Search — "test-course-for-cs" | `GET` | `{{baseUrl}}/api/v1/bundle-courses?searchTerm=test-course-for-cs` |
| 13 | Search — "TC-CS-01" | `GET` | `{{baseUrl}}/api/v1/bundle-courses?searchTerm=TC-CS-01` |
| 14 | Filter bundleId + isActive | `GET` | `{{baseUrl}}/api/v1/bundle-courses?bundleId=1&isActive=true` |
| 15 | Filter courseId + pagination | `GET` | `{{baseUrl}}/api/v1/bundle-courses?pageIndex=1&pageSize=10&courseId=101` |
| 16 | Sort by id ASC (default) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=id&sortDirection=ASC` |
| 17 | Sort by id DESC | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=id&sortDirection=DESC` |
| 18 | Sort by bundle_id ASC | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=bundle_id&sortDirection=ASC` |
| 19 | Sort by bundle_id DESC | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=bundle_id&sortDirection=DESC` |
| 20 | Sort by course_id ASC | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=course_id&sortDirection=ASC` |
| 21 | Sort by course_id DESC | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=course_id&sortDirection=DESC` |
| 22 | Sort by display_order ASC (default) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=display_order&sortDirection=ASC` |
| 23 | Sort by display_order DESC | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=display_order&sortDirection=DESC` |
| 24 | Sort by created_at ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=created_at&sortDirection=ASC` |
| 25 | Sort by created_at DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=created_at&sortDirection=DESC` |
| 26 | Sort by updated_at DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/bundle-courses?sortColumn=updated_at&sortDirection=DESC` |
| 27 | Combo — bundleId + isActive + sort | `GET` | `{{baseUrl}}/api/v1/bundle-courses?bundleId=1&isActive=true&sortColumn=display_order&sortDirection=ASC` |
| 28 | Combo — search + filter + paginate | `GET` | `{{baseUrl}}/api/v1/bundle-courses?pageIndex=1&pageSize=10&bundleId=1&searchTerm=test&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/bundle-courses/:id`

Get one bundle-course mapping by ID, including all metadata. Returns even soft-deleted records (does not skip is_deleted filter).

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/bundle-courses/:id` |
| Permission | `bundle_course.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "bundleId": 1,
    "courseId": 101,
    "bundleCode": "BUNDLE-TEST-01",
    "bundleSlug": "bundle-test-01",
    "bundlePrice": 119.99,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "coursePrice": 0,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:18:42.447Z",
    "updatedAt": "2026-04-12T11:18:42.447Z"
  }
}
```

#### 200 OK — soft-deleted record

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 5,
    "bundleId": 2,
    "courseId": 105,
    "bundleCode": "INST-BUNDLE-01",
    "bundleSlug": "inst-bundle-01",
    "bundlePrice": 149.99,
    "courseCode": "WEB-003",
    "courseSlug": "web-development-advanced",
    "coursePrice": 79.99,
    "displayOrder": 3,
    "isActive": false,
    "isDeleted": true,
    "createdAt": "2026-04-11T15:20:00.000Z",
    "updatedAt": "2026-04-12T10:30:15.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle-course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_course.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/bundle-courses`

Create a new bundle-course mapping. Validates that both parent bundle and course exist and are not soft-deleted. Validates that no active duplicate pair (same bundleId + courseId) exists. The mapping is created with isActive=TRUE by default.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/bundle-courses` |
| Permission | `bundle_course.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `bundleId` | int | yes | Must reference an existing, non-deleted bundle. |
| `courseId` | int | yes | Must reference an existing, non-deleted course. |
| `displayOrder` | int | no | Display order for UI sorting (course position within bundle). Defaults to `0`. Must be >= 0. |
| `isActive` | bool | no | Whether mapping is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "bundleId": 1,
  "courseId": 101,
  "displayOrder": 1,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "bundleId": 1,
  "courseId": 101
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Bundle-course created successfully",
  "data": {
    "id": 4,
    "bundleId": 1,
    "courseId": 104,
    "bundleCode": "BUNDLE-TEST-01",
    "bundleSlug": "bundle-test-01",
    "bundlePrice": 119.99,
    "courseCode": "TC-INT-04",
    "courseSlug": "test-course-intermediate-04",
    "coursePrice": 19.99,
    "displayOrder": 3,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Bundle ID and Course ID are required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "bundleId",
      "message": "bundleId is required"
    }
  ]
}
```

#### 400 Bad Request — invalid display order

```json
{
  "success": false,
  "message": "Display order must be a non-negative integer",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "displayOrder",
      "message": "displayOrder must be >= 0"
    }
  ]
}
```

#### 404 Not Found — bundle does not exist

```json
{
  "success": false,
  "message": "Bundle 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 404 Not Found — course does not exist

```json
{
  "success": false,
  "message": "Course 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate active pair

```json
{
  "success": false,
  "message": "This bundle-course pair is already active",
  "code": "DUPLICATE_MAPPING"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_course.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/bundle-courses/:id`

Update a bundle-course mapping by ID. Allows partial updates. Foreign keys (bundleId, courseId) are immutable and cannot be changed. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/bundle-courses/:id` |
| Permission | `bundle_course.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `displayOrder` | int | no | New display order. Must be >= 0. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update display order

```json
{
  "displayOrder": 2
}
```

### Sample request — deactivate

```json
{
  "isActive": false
}
```

### Sample request — both

```json
{
  "displayOrder": 5,
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Bundle-course updated successfully",
  "data": {
    "id": 1,
    "bundleId": 1,
    "courseId": 101,
    "bundleCode": "BUNDLE-TEST-01",
    "bundleSlug": "bundle-test-01",
    "bundlePrice": 119.99,
    "courseCode": "TC-CS-01",
    "courseSlug": "test-course-for-cs",
    "coursePrice": 0,
    "displayOrder": 5,
    "isActive": true,
    "createdAt": "2026-04-12T11:18:42.447Z",
    "updatedAt": "2026-04-12T11:25:33.891Z"
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field (displayOrder, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "bundleId and courseId are immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 400 Bad Request — invalid display order

```json
{
  "success": false,
  "message": "Display order must be a non-negative integer",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "displayOrder",
      "message": "displayOrder must be >= 0"
    }
  ]
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle-course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_course.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/bundle-courses/:id`

Soft-delete a bundle-course mapping by ID. Sets is_active=FALSE, is_deleted=TRUE, and deleted_at to the current timestamp. The record remains in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/bundle-courses/:id` |
| Permission | `bundle_course.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Bundle-course deleted successfully",
  "data": {
    "id": 3,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle-course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_course.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/bundle-courses/:id/restore`

Restore a soft-deleted bundle-course mapping by ID. Validates that the record is deleted, that its parent bundle is not deleted, and that its parent course is not deleted. Checks that no active duplicate pair exists before restoring. Sets is_active=TRUE, is_deleted=FALSE, and deleted_at=NULL.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/bundle-courses/:id/restore` |
| Permission | `bundle_course.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Bundle-course restored successfully",
  "data": {
    "id": 3,
    "bundleId": 2,
    "courseId": 103,
    "bundleCode": "INST-BUNDLE-01",
    "bundleSlug": "inst-bundle-01",
    "bundlePrice": 149.99,
    "courseCode": "WEB-001",
    "courseSlug": "web-development-101",
    "coursePrice": 49.99,
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-04-12T11:20:33.105Z",
    "updatedAt": "2026-04-12T11:30:02.654Z"
  }
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "Bundle-course 1 is not deleted and cannot be restored",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found — parent bundle deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent bundle is deleted",
  "code": "PARENT_DELETED"
}
```

#### 404 Not Found — parent course deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent course is deleted",
  "code": "PARENT_DELETED"
}
```

#### 409 Conflict — duplicate active pair would be created

```json
{
  "success": false,
  "message": "Cannot restore: an active bundle-course pair for this bundle and course already exists",
  "code": "DUPLICATE_MAPPING"
}
```

#### 404 Not Found — bundle-course not found

```json
{
  "success": false,
  "message": "Bundle-course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_course.restore",
  "code": "FORBIDDEN"
}
```

---

## Data transfer object (DTO)

The **BundleCourseDto** shape returned by all endpoints:

```json
{
  "id": 1,
  "bundleId": 1,
  "courseId": 101,
  "bundleCode": "BUNDLE-TEST-01",
  "bundleSlug": "bundle-test-01",
  "bundlePrice": 119.99,
  "courseCode": "TC-CS-01",
  "courseSlug": "test-course-for-cs",
  "coursePrice": 0,
  "displayOrder": 1,
  "isActive": true,
  "createdAt": "2026-04-12T11:18:42.447Z"
}
```

Soft-deleted records include additional fields:

```json
{
  "id": 5,
  "bundleId": 2,
  "courseId": 105,
  "bundleCode": "INST-BUNDLE-01",
  "bundleSlug": "inst-bundle-01",
  "bundlePrice": 149.99,
  "courseCode": "WEB-003",
  "courseSlug": "web-development-advanced",
  "coursePrice": 79.99,
  "displayOrder": 3,
  "isActive": false,
  "isDeleted": true,
  "createdAt": "2026-04-11T15:20:00.000Z",
  "updatedAt": "2026-04-12T10:30:15.000Z"
}
```

### Field descriptions

| Field | Type | Notes |
|---|---|---|
| `id` | int | Unique identifier. Primary key. |
| `bundleId` | int | Foreign key to bundles table. Immutable. |
| `courseId` | int | Foreign key to courses table. Immutable. |
| `bundleCode` | string | Denormalized from bundles.code (read-only). |
| `bundleSlug` | string | Denormalized from bundles.slug (read-only). |
| `bundlePrice` | decimal | Denormalized from bundles.price (read-only). |
| `courseCode` | string | Denormalized from courses.code (read-only). |
| `courseSlug` | string | Denormalized from courses.slug (read-only). |
| `coursePrice` | decimal | Denormalized from courses.price (read-only). |
| `displayOrder` | int | Course position within the bundle (0-based). Mutable. |
| `isActive` | bool | Whether this mapping is active. Mutable. |
| `isDeleted` | bool | Soft-delete flag (present only for deleted records). |
| `createdAt` | ISO 8601 | Timestamp of record creation (UTC). |
| `updatedAt` | ISO 8601 | Timestamp of last update (UTC). |
