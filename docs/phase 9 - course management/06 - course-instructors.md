# Phase 9 — Course Instructors

A course-instructor is a junction table that maps instructors (users) to courses. Each mapping documents the relationship between a course and an instructor, including role, contribution details, revenue share, and visibility. A course can have multiple instructors with different roles ordered by display sequence. Instructors are referenced from the users table and must not be deleted when linked. Course-instructor mappings support soft-delete and admin restore. All routes require authentication.

Permission codes: `course_instructor.read`, `course_instructor.create`, `course_instructor.update`, `course_instructor.delete`, `course_instructor.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Previous](./05%20-%20course-chapters.md) · [Next →](./07%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1course-instructors) | `GET` | `{{baseUrl}}/api/v1/course-instructors` | `course_instructor.read` | List all course-instructor mappings with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1course-instructorsid) | `GET` | `{{baseUrl}}/api/v1/course-instructors/:id` | `course_instructor.read` | Get one mapping by ID. |
| [§1.3](#13-post-apiv1course-instructors) | `POST` | `{{baseUrl}}/api/v1/course-instructors` | `course_instructor.create` | Create a new course-instructor mapping. |
| [§1.4](#14-patch-apiv1course-instructorsid) | `PATCH` | `{{baseUrl}}/api/v1/course-instructors/:id` | `course_instructor.update` | Update a mapping by ID. |
| [§1.5](#15-delete-apiv1course-instructorsid) | `DELETE` | `{{baseUrl}}/api/v1/course-instructors/:id` | `course_instructor.delete` | Soft-delete a mapping (SA only). |
| [§1.6](#16-post-apiv1course-instructorsidrestore) | `POST` | `{{baseUrl}}/api/v1/course-instructors/:id/restore` | `course_instructor.restore` | Restore a soft-deleted mapping (admin+ only). |

---

## 1.1 `GET /api/v1/course-instructors`

List all course-instructor mappings with support for pagination, search, filtering, and sorting. Results include denormalized course and instructor metadata for quick reference.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-instructors` |
| Permission | `course_instructor.read` |

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
| `instructorId` | int | — | Filter by instructor (user) ID. |
| `instructorRole` | enum | — | Filter by role: `primary`, `co_instructor`, `guest`, `teaching_assistant`, `mentor`, `reviewer`, `other`. |
| `isVisible` | bool | — | Filter by visibility flag. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | `false` | Include/exclude soft-deleted mappings. Defaults to false. |
| `searchTerm` | string | — | `ILIKE` across course code, course slug, instructor first_name, last_name, email. |
| `sortColumn` | enum | `display_order` | `id`, `display_order`, `course_id`, `instructor_id`, `created_at`, `updated_at`. |
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
      "instructorId": 54,
      "instructorRole": "primary",
      "contribution": "Led entire course design and content creation",
      "revenueSharePct": 50.00,
      "joinDate": "2026-01-15",
      "leaveDate": null,
      "displayOrder": 1,
      "isVisible": true,
      "isActive": true,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "courseCode": "WEB-001",
      "courseSlug": "web-fundamentals",
      "courseIsActive": true,
      "instructorFirstName": "Sarah",
      "instructorLastName": "Johnson",
      "instructorEmail": "sarah.johnson@example.com"
    },
    {
      "id": 2,
      "courseId": 1,
      "instructorId": 55,
      "instructorRole": "co_instructor",
      "contribution": "Developed video content and practical exercises",
      "revenueSharePct": 25.00,
      "joinDate": "2026-02-01",
      "leaveDate": null,
      "displayOrder": 2,
      "isVisible": true,
      "isActive": true,
      "createdAt": "2026-04-11T14:30:00.000Z",
      "updatedAt": "2026-04-11T14:30:00.000Z",
      "courseCode": "WEB-001",
      "courseSlug": "web-fundamentals",
      "courseIsActive": true,
      "instructorFirstName": "Michael",
      "instructorLastName": "Chen",
      "instructorEmail": "michael.chen@example.com"
    },
    {
      "id": 3,
      "courseId": 1,
      "instructorId": 56,
      "instructorRole": "teaching_assistant",
      "contribution": "Provides student support and feedback",
      "revenueSharePct": 10.00,
      "joinDate": "2026-03-01",
      "leaveDate": null,
      "displayOrder": 3,
      "isVisible": true,
      "isActive": true,
      "createdAt": "2026-04-10T09:15:00.000Z",
      "updatedAt": "2026-04-10T09:15:00.000Z",
      "courseCode": "WEB-001",
      "courseSlug": "web-fundamentals",
      "courseIsActive": true,
      "instructorFirstName": "Emily",
      "instructorLastName": "Rodriguez",
      "instructorEmail": "emily.rodriguez@example.com"
    }
  ],
  "meta": { "page": 0, "limit": 25, "totalCount": 127, "totalPages": 6 }
}
```

#### 403 Forbidden — caller lacks `course_instructor.read`

```json
{
  "success": false,
  "message": "Missing required permission: course_instructor.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/course-instructors` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 0 (defaults) | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=0&pageSize=25` |
| 2 | Page 1, default size | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=1&pageSize=25` |
| 3 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=2&pageSize=25` |
| 4 | Page 0, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=0&pageSize=5` |
| 5 | Page 0, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=0&pageSize=10` |
| 6 | Page 0, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=0&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=9999&pageSize=25` |
| 8 | Filter by courseId=1 | `GET` | `{{baseUrl}}/api/v1/course-instructors?courseId=1` |
| 9 | Filter by courseId=2 | `GET` | `{{baseUrl}}/api/v1/course-instructors?courseId=2` |
| 10 | Filter by instructorId=54 | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorId=54` |
| 11 | Filter by instructorId=55 | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorId=55` |
| 12 | Filter by role=primary | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorRole=primary` |
| 13 | Filter by role=co_instructor | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorRole=co_instructor` |
| 14 | Filter by role=teaching_assistant | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorRole=teaching_assistant` |
| 15 | Filter by role=mentor | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorRole=mentor` |
| 16 | Filter by role=guest | `GET` | `{{baseUrl}}/api/v1/course-instructors?instructorRole=guest` |
| 17 | Visible only (isVisible=true) | `GET` | `{{baseUrl}}/api/v1/course-instructors?isVisible=true` |
| 18 | Hidden only (isVisible=false) | `GET` | `{{baseUrl}}/api/v1/course-instructors?isVisible=false` |
| 19 | Active only (isActive=true) | `GET` | `{{baseUrl}}/api/v1/course-instructors?isActive=true` |
| 20 | Inactive only (isActive=false) | `GET` | `{{baseUrl}}/api/v1/course-instructors?isActive=false` |
| 21 | Deleted only (isDeleted=true) | `GET` | `{{baseUrl}}/api/v1/course-instructors?isDeleted=true` |
| 22 | Non-deleted only (isDeleted=false) | `GET` | `{{baseUrl}}/api/v1/course-instructors?isDeleted=false` |
| 23 | Search — "Sarah" | `GET` | `{{baseUrl}}/api/v1/course-instructors?searchTerm=Sarah` |
| 24 | Search — "Johnson" | `GET` | `{{baseUrl}}/api/v1/course-instructors?searchTerm=Johnson` |
| 25 | Search — "web-fundamentals" | `GET` | `{{baseUrl}}/api/v1/course-instructors?searchTerm=web-fundamentals` |
| 26 | Search — "WEB-001" | `GET` | `{{baseUrl}}/api/v1/course-instructors?searchTerm=WEB-001` |
| 27 | Search — "chen@example.com" | `GET` | `{{baseUrl}}/api/v1/course-instructors?searchTerm=chen@example.com` |
| 28 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=0&pageSize=10&searchTerm=Sarah` |
| 29 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=id&sortDirection=ASC` |
| 30 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=id&sortDirection=DESC` |
| 31 | Sort by `display_order` ASC (default) | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=display_order&sortDirection=ASC` |
| 32 | Sort by `display_order` DESC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=display_order&sortDirection=DESC` |
| 33 | Sort by `course_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=course_id&sortDirection=ASC` |
| 34 | Sort by `course_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=course_id&sortDirection=DESC` |
| 35 | Sort by `instructor_id` ASC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=instructor_id&sortDirection=ASC` |
| 36 | Sort by `instructor_id` DESC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=instructor_id&sortDirection=DESC` |
| 37 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=created_at&sortDirection=DESC` |
| 38 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=created_at&sortDirection=ASC` |
| 39 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=updated_at&sortDirection=DESC` |
| 40 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/course-instructors?sortColumn=updated_at&sortDirection=ASC` |
| 41 | Combo — courseId=1, instructorId=54 | `GET` | `{{baseUrl}}/api/v1/course-instructors?courseId=1&instructorId=54` |
| 42 | Combo — courseId=1, role=primary | `GET` | `{{baseUrl}}/api/v1/course-instructors?courseId=1&instructorRole=primary` |
| 43 | Combo — courseId=1, sorted by displayOrder | `GET` | `{{baseUrl}}/api/v1/course-instructors?courseId=1&sortColumn=display_order&sortDirection=ASC` |
| 44 | Combo — active, visible, non-deleted, sorted by id | `GET` | `{{baseUrl}}/api/v1/course-instructors?isActive=true&isVisible=true&isDeleted=false&sortColumn=id&sortDirection=ASC` |
| 45 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/course-instructors?pageIndex=0&pageSize=10&searchTerm=Sarah&courseId=1&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/course-instructors/:id`

Get one course-instructor mapping by ID, including all denormalized course and instructor metadata.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/course-instructors/:id` |
| Permission | `course_instructor.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full course-instructor mapping object with denormalized metadata.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseId": 1,
    "instructorId": 54,
    "instructorRole": "primary",
    "contribution": "Led entire course design and content creation",
    "revenueSharePct": 50.00,
    "joinDate": "2026-01-15",
    "leaveDate": null,
    "displayOrder": 1,
    "isVisible": true,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseCode": "WEB-001",
    "courseSlug": "web-fundamentals",
    "courseIsActive": true,
    "instructorFirstName": "Sarah",
    "instructorLastName": "Johnson",
    "instructorEmail": "sarah.johnson@example.com"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-instructor mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_instructor.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/course-instructors`

Create a new course-instructor mapping. The course and instructor (user) must both exist and not be deleted. No duplicate active mappings are allowed for the same (courseId, instructorId) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-instructors` |
| Permission | `course_instructor.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | yes | Foreign key to courses table. Course must exist and not be deleted. |
| `instructorId` | int | yes | Foreign key to users table. User must exist and not be deleted. |
| `instructorRole` | enum | no | Role: `primary`, `co_instructor`, `guest`, `teaching_assistant`, `mentor`, `reviewer`, `other`. Defaults to `co_instructor`. |
| `contribution` | string | no | Optional description of instructor's contribution. Maximum 10000 characters. Defaults to `null`. |
| `revenueSharePct` | decimal | no | Revenue share percentage (0-100). Defaults to `null`. |
| `joinDate` | date | no | Date instructor joined the course (YYYY-MM-DD format). Defaults to `null`. |
| `leaveDate` | date | no | Date instructor left the course (YYYY-MM-DD format). Defaults to `null`. |
| `displayOrder` | int | no | Display order for UI rendering. Defaults to `0`. Minimum value 0. |
| `isVisible` | bool | no | Whether mapping is visible in course display. Defaults to `true`. |
| `isActive` | bool | no | Defaults to `true`. |

### Sample request — basic mapping

```json
{
  "courseId": 1,
  "instructorId": 54
}
```

### Sample request — with role and joinDate

```json
{
  "courseId": 1,
  "instructorId": 54,
  "instructorRole": "primary",
  "joinDate": "2026-01-15"
}
```

### Sample request — with contribution and revenue share

```json
{
  "courseId": 1,
  "instructorId": 54,
  "instructorRole": "primary",
  "contribution": "Led entire course design and content creation",
  "revenueSharePct": 50.00,
  "joinDate": "2026-01-15",
  "displayOrder": 1,
  "isVisible": true,
  "isActive": true
}
```

### Sample request — with all fields

```json
{
  "courseId": 1,
  "instructorId": 55,
  "instructorRole": "co_instructor",
  "contribution": "Developed video content and practical exercises",
  "revenueSharePct": 25.00,
  "joinDate": "2026-02-01",
  "leaveDate": null,
  "displayOrder": 2,
  "isVisible": true,
  "isActive": true
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Course-instructor mapping created",
  "data": {
    "id": 1,
    "courseId": 1,
    "instructorId": 54,
    "instructorRole": "primary",
    "contribution": "Led entire course design and content creation",
    "revenueSharePct": 50.00,
    "joinDate": "2026-01-15",
    "leaveDate": null,
    "displayOrder": 1,
    "isVisible": true,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "courseCode": "WEB-001",
    "courseSlug": "web-fundamentals",
    "courseIsActive": true,
    "instructorFirstName": "Sarah",
    "instructorLastName": "Johnson",
    "instructorEmail": "sarah.johnson@example.com"
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

#### 400 Bad Request — validation error (instructor/user does not exist)

```json
{
  "success": false,
  "message": "Instructor (user) 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — invalid instructor role

```json
{
  "success": false,
  "message": "Invalid instructor_role. Must be one of: primary, co_instructor, guest, teaching_assistant, mentor, reviewer, other",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate active mapping

```json
{
  "success": false,
  "message": "An active mapping for course 1 and instructor 54 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_instructor.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/course-instructors/:id`

Update a course-instructor mapping. courseId and instructorId are immutable. At least one other field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/course-instructors/:id` |
| Permission | `course_instructor.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `instructorRole` | enum | Role: `primary`, `co_instructor`, `guest`, `teaching_assistant`, `mentor`, `reviewer`, `other`. |
| `contribution` | string | Optional description of instructor's contribution. Maximum 10000 characters. Pass empty string to clear. |
| `revenueSharePct` | decimal | Revenue share percentage (0-100). |
| `joinDate` | date | Date instructor joined (YYYY-MM-DD format). |
| `leaveDate` | date | Date instructor left (YYYY-MM-DD format). |
| `displayOrder` | int | Display order for UI rendering. Minimum value 0. |
| `isVisible` | bool | Whether mapping is visible in course display. |
| `isActive` | bool | Active flag. |

### Sample request — update role

```json
{
  "instructorRole": "primary"
}
```

### Sample request — set contribution

```json
{
  "contribution": "Developed video content and practical exercises"
}
```

### Sample request — clear contribution

```json
{
  "contribution": ""
}
```

### Sample request — update revenue share

```json
{
  "revenueSharePct": 35.00
}
```

### Sample request — set leave date

```json
{
  "leaveDate": "2026-12-31"
}
```

### Sample request — hide from display

```json
{
  "isVisible": false
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
  "instructorRole": "co_instructor",
  "contribution": "Updated contribution description",
  "revenueSharePct": 30.00,
  "displayOrder": 2,
  "isVisible": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-instructor mapping updated",
  "data": {
    "id": 1,
    "courseId": 1,
    "instructorId": 54,
    "instructorRole": "primary",
    "contribution": "Updated contribution description",
    "revenueSharePct": 35.00,
    "joinDate": "2026-01-15",
    "leaveDate": "2026-12-31",
    "displayOrder": 1,
    "isVisible": true,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:15:00.000Z",
    "courseCode": "WEB-001",
    "courseSlug": "web-fundamentals",
    "courseIsActive": true,
    "instructorFirstName": "Sarah",
    "instructorLastName": "Johnson",
    "instructorEmail": "sarah.johnson@example.com"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course-instructor mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field (instructorRole, contribution, revenueSharePct, joinDate, leaveDate, displayOrder, isVisible, isActive) is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — invalid role

```json
{
  "success": false,
  "message": "Invalid instructor_role. Must be one of: primary, co_instructor, guest, teaching_assistant, mentor, reviewer, other",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update immutable field

```json
{
  "success": false,
  "message": "Fields courseId and instructorId are immutable",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_instructor.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/course-instructors/:id`

Soft-delete a course-instructor mapping. Only super-admin can soft-delete. The mapping is marked as deleted but retained in the database. Use POST /:id/restore to recover.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/course-instructors/:id` |
| Permission | `course_instructor.delete` |

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
  "message": "Course-instructor mapping 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — only super-admin

```json
{
  "success": false,
  "message": "Missing required permission: course_instructor.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/course-instructors/:id/restore`

Restore a soft-deleted course-instructor mapping. Admin+ only. Validates that the parent course has not been deleted and that no duplicate active mapping exists for the same (courseId, instructorId) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/course-instructors/:id/restore` |
| Permission | `course_instructor.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Course-instructor mapping restored",
  "data": {
    "id": 1,
    "courseId": 1,
    "instructorId": 54,
    "instructorRole": "primary",
    "contribution": "Led entire course design and content creation",
    "revenueSharePct": 50.00,
    "joinDate": "2026-01-15",
    "leaveDate": null,
    "displayOrder": 1,
    "isVisible": true,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 3,
    "updatedBy": 3,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:30:00.000Z",
    "courseCode": "WEB-001",
    "courseSlug": "web-fundamentals",
    "courseIsActive": true,
    "instructorFirstName": "Sarah",
    "instructorLastName": "Johnson",
    "instructorEmail": "sarah.johnson@example.com"
  }
}
```

#### 404 Not Found — mapping not found

```json
{
  "success": false,
  "message": "Course-instructor mapping 999 not found",
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
  "message": "Cannot restore: an active mapping for course 1 and instructor 54 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course_instructor.restore",
  "code": "FORBIDDEN"
}
```

---

## Postman saved examples summary

This endpoint family provides **45+ saved examples** covering:

- **Pagination**: default (pageIndex=0), various page sizes, out-of-range
- **Filtering by courseId**: single course, multiple courses
- **Filtering by instructorId**: multiple instructors
- **Filtering by instructorRole**: primary, co_instructor, teaching_assistant, mentor, guest, reviewer, other
- **Filtering by isVisible & isActive & isDeleted**: visible/hidden, active/inactive, deleted/non-deleted combinations
- **Search**: course code, course slug, instructor first/last name, instructor email
- **Sorting**: by id, display_order, course_id, instructor_id, created_at, updated_at (both ASC and DESC)
- **Combined filters & sorts**: e.g., course + instructor, course + role, course + display order sort, active + visible + non-deleted + sorted
- **GET by ID**: single mapping retrieval
- **POST create**: basic, with role and joinDate, with contribution and revenue share, with all fields
- **PATCH update**: each individual field, clearing contribution, combined field updates
- **DELETE**: soft-delete request
- **POST restore**: restore after soft-delete
- **Error cases**: 404 (not found), 400 (validation: missing course, missing instructor, invalid role, duplicate mapping, immutable field update, no fields to update, restore validations), 403 (forbidden permissions)

Use the **endpoint summary table** above and **saved examples** tables in each section to import these into your Postman collection.
