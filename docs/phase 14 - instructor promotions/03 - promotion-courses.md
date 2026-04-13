# Phase 14 — Promotion Courses

Promotion courses link instructor promotions to specific courses. Each mapping defines which course is included in a promotion's "specific_courses" scope, with display ordering.

Permission codes: `instructor_promotion_course.read`, `instructor_promotion_course.create`, `instructor_promotion_course.update`, `instructor_promotion_course.delete`, `instructor_promotion_course.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `instructor_promotion_course.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31-get-apiv1instructor-promotionsidcourses) | `GET` | `/api/v1/instructor-promotions/:id/courses` | `instructor_promotion_course.read` | List course mappings for a promotion. |
| [§3.2](#32-get-apiv1instructor-promotionsidcoursescourseapid) | `GET` | `/api/v1/instructor-promotions/:id/courses/:courseMapId` | `instructor_promotion_course.read` | Get one course mapping by ID. |
| [§3.3](#33-post-apiv1instructor-promotionsidcourses) | `POST` | `/api/v1/instructor-promotions/:id/courses` | `instructor_promotion_course.create` | Create a course mapping. |
| [§3.4](#34-patch-apiv1instructor-promotionsidcoursescourseapid) | `PATCH` | `/api/v1/instructor-promotions/:id/courses/:courseMapId` | `instructor_promotion_course.update` | Update a course mapping. |
| [§3.5](#35-delete-apiv1instructor-promotionsidcoursescourseapid) | `DELETE` | `/api/v1/instructor-promotions/:id/courses/:courseMapId` | `instructor_promotion_course.delete` | Soft-delete a course mapping. |
| [§3.6](#36-post-apiv1instructor-promotionsidcoursescourseapidrrestore) | `POST` | `/api/v1/instructor-promotions/:id/courses/:courseMapId/restore` | `instructor_promotion_course.restore` | Restore a soft-deleted course mapping. |

---

## 3.1 `GET /api/v1/instructor-promotions/:id/courses`

List all course mappings for a specific instructor promotion.

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
| `isActive` | bool | — | Filter by active/inactive mappings. |
| `isDeleted` | bool | `false` | Include soft-deleted mappings. |
| `sortColumn` | enum | `display_order` | `id`, `promotion_id`, `course_id`, `display_order`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "promotionId": 1,
      "courseId": 1,
      "displayOrder": 1,
      "promoCode": "SUMMER25",
      "discountType": "percentage",
      "discountValue": 30.00,
      "courseCode": "TC-CS-01",
      "courseSlug": "test-course-for-cs",
      "coursePrice": 7999.00,
      "courseStatus": "draft",
      "createdBy": 54,
      "updatedBy": 54,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T17:00:00.000Z",
      "updatedAt": "2026-04-12T17:00:00.000Z"
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

#### 404 Not Found

```json
{ "success": false, "message": "Instructor promotion 999 not found" }
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?pageIndex=1&pageSize=10` |
| 4 | Custom page size (50) | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?pageIndex=1&pageSize=50` |
| 5 | Filter by courseId=1 | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?courseId=1` |
| 6 | Filter by courseId=5 | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?courseId=5` |
| 7 | Filter by isActive=true | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?isActive=true` |
| 8 | Filter by isActive=false | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?isActive=false` |
| 9 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?isDeleted=true` |
| 10 | Sort by id ASC | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=id&sortDirection=ASC` |
| 11 | Sort by id DESC | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=id&sortDirection=DESC` |
| 12 | Sort by display_order ASC | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=display_order&sortDirection=ASC` |
| 13 | Sort by display_order DESC | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=display_order&sortDirection=DESC` |
| 14 | Sort by course_id ASC | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=course_id&sortDirection=ASC` |
| 15 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=created_at&sortDirection=DESC` |
| 16 | Sort by created_at ASC (oldest) | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=created_at&sortDirection=ASC` |
| 17 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?sortColumn=updated_at&sortDirection=DESC` |
| 18 | Combo — active courses only | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?isActive=true` |
| 19 | Combo — filter course + active | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?courseId=1&isActive=true` |
| 20 | Combo — custom size + sort + filter | `{{baseUrl}}/api/v1/instructor-promotions/1/courses?pageIndex=1&pageSize=10&isActive=true&sortColumn=display_order&sortDirection=ASC` |

---

## 3.2 `GET /api/v1/instructor-promotions/:id/courses/:courseMapId`

Get a single course mapping by ID.

### Responses

#### 200 OK

Same shape as a single object in §3.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Promotion course mapping 999 not found" }
```

---

## 3.3 `POST /api/v1/instructor-promotions/:id/courses`

Create a course mapping for an instructor promotion.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | **yes** | Must reference existing, non-deleted course. |
| `displayOrder` | int | no | 0-32767. Default: 0. Controls sort order in UI. |
| `isActive` | bool | no | Default: `true`. |

**Note**: `promotionId` comes from the URL path parameter, NOT from the request body.

**Example request**

```json
{
  "courseId": 1,
  "displayOrder": 1,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Promotion course mapping created",
  "data": { "id": 1, "promotionId": 1, "courseId": 1, "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "course_id 999 does not exist or is deleted." }
```

```json
{ "success": false, "message": "This course is already mapped to this promotion." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Instructor promotion 999 not found" }
```

---

## 3.4 `PATCH /api/v1/instructor-promotions/:id/courses/:courseMapId`

Update a course mapping. `promotion_id` and `course_id` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | 0-32767. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated course mapping (same shape as §3.2).

#### 404 Not Found

```json
{ "success": false, "message": "Promotion course mapping 999 not found" }
```

---

## 3.5 `DELETE /api/v1/instructor-promotions/:id/courses/:courseMapId`

Soft-delete a course mapping.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Promotion course mapping deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "course_mapping_id 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Promotion course mapping 999 not found" }
```

---

## 3.6 `POST /api/v1/instructor-promotions/:id/courses/:courseMapId/restore`

Restore a soft-deleted course mapping. Validates parent promotion and course are not deleted.

### Responses

#### 200 OK

Returns the restored course mapping (same shape as §3.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore mapping: parent promotion is deleted." }
```

```json
{ "success": false, "message": "Cannot restore mapping: course is deleted." }
```

```json
{ "success": false, "message": "course_mapping_id 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Promotion course mapping 999 not found" }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., course already mapped to promotion). |
| `500` | Internal server error. |
