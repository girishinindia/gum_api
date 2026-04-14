# Phase 4 — User Education

`user_education` is a **1:M child of `users`** that stores a learner or instructor's academic history: one row per qualification (SSC, HSC, Bachelor's, Master's, certifications, etc.). The row references `education_levels` (a phase-02 master-data lookup) for the level + level order + category, and carries institution, board/university, field of study, specialization, grade, start/end dates, description, and a certificate URL.

Unlike `user_profiles` (which is 1:1 and has no `is_active`/`is_deleted` of its own), this table has **its own soft-delete flags**. A deleted row is hidden from default GETs but is kept on disk so an admin can un-delete via the restore route.

All routes require auth. Permission codes: `user_education.create`, `user_education.read`, `user_education.read.own`, `user_education.update`, `user_education.update.own`, `user_education.delete`, `user_education.delete.own`, `user_education.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [01 user-profiles](01%20-%20user-profiles.md) · **Next →** [03 user-experience](03%20-%20user-experience.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21-get-apiv1user-education) | `GET` | `{{baseUrl}}/api/v1/user-education` | `user_education.read` | List all education rows (admin+). |
| [§2.2](#22-get-apiv1user-educationme) | `GET` | `{{baseUrl}}/api/v1/user-education/me` | `user_education.read.own` | List caller's own education rows. |
| [§2.3](#23-post-apiv1user-educationme) | `POST` | `{{baseUrl}}/api/v1/user-education/me` | `user_education.update.own` | Self-service create — `userId` derived from token. |
| [§2.4](#24-patch-apiv1user-educationmeid) | `PATCH` | `{{baseUrl}}/api/v1/user-education/me/:id` | `user_education.update.own` (self match enforced) | Self-service partial update. |
| [§2.5](#25-delete-apiv1user-educationmeid) | `DELETE` | `{{baseUrl}}/api/v1/user-education/me/:id` | `user_education.delete.own` (self match enforced) | Self-service soft-delete. |
| [§2.6](#26-get-apiv1user-educationid) | `GET` | `{{baseUrl}}/api/v1/user-education/:id` | `user_education.read` *or* `user_education.read.own` (+ self match) | Get one row by id. |
| [§2.7](#27-post-apiv1user-education) | `POST` | `{{baseUrl}}/api/v1/user-education` | `user_education.create` | Admin create — targets any `userId`. |
| [§2.8](#28-patch-apiv1user-educationid) | `PATCH` | `{{baseUrl}}/api/v1/user-education/:id` | `user_education.update` *or* `user_education.update.own` (+ self match) | Admin or self partial update. |
| [§2.9](#29-delete-apiv1user-educationid) | `DELETE` | `{{baseUrl}}/api/v1/user-education/:id` | `user_education.delete` *or* `user_education.delete.own` (+ self match) | Admin or self soft-delete. |
| [§2.10](#210-post-apiv1user-educationidrestore) | `POST` | `{{baseUrl}}/api/v1/user-education/:id/restore` | `user_education.restore` (admin+) | Un-soft-delete a hidden row. |

> `/me` routes must be declared before `/:id` in the router so Express does not treat `me` as an id segment.

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete and restore. |
| Admin | Everything **except** the global `user_education.delete` (admin still has `delete.own` for their own rows, and `restore` to un-delete any row). |
| Instructor | Self only — `read.own`, `update.own`, `delete.own`. No restore path (they never see their own deleted rows). |
| Student | Same as instructor. |

---

## 2.1 `GET /api/v1/user-education`

List education rows. Backed by `udf_get_user_education`, which joins `user_education` → `users` → `education_levels`. Hides soft-deleted rows by default — pass `isDeleted=true` to include them.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-education` |
| Permission | `user_education.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `educationLevelId` | bigint | — | Filter by level id (FK to `education_levels`). |
| `levelCategory` | string | — | Filter by level category (e.g. `school`, `undergraduate`, `postgraduate`). |
| `gradeType` | enum | — | `percentage` / `cgpa` / `gpa` / `grade` / `pass_fail` / `other`. |
| `isCurrentlyStudying` | bool | — | `true` hides completed qualifications. |
| `isHighest` | bool | — | Filter to the row marked as highest qualification. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Pass `true` to include soft-deleted rows (admin audit view). |
| `userRole` | string | — | Parent user's role code, e.g. `student`, `instructor`. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across institution, board/university, field of study, specialization, description, first/last name, email. |
| `sortTable` | enum | `edu` | `edu` / `level` / `user`. |
| `sortColumn` | enum | `id` | See schemas file for full allowlist. |
| `sortDirection` | enum | `DESC` | `ASC` / `DESC`. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 12,
      "userId": 42,
      "educationLevelId": 3,
      "institutionName": "IIT Bombay",
      "boardOrUniversity": "Indian Institute of Technology",
      "fieldOfStudy": "Computer Science",
      "specialization": "Machine Learning",
      "gradeOrPercentage": "9.1",
      "gradeType": "cgpa",
      "startDate": "2018-08-01",
      "endDate": "2022-06-30",
      "isCurrentlyStudying": false,
      "isHighestQualification": true,
      "certificateUrl": "https://cdn.growupmore.com/certs/42/btech.pdf",
      "description": "B.Tech in CS, graduated with honors.",
      "createdBy": 1,
      "updatedBy": 42,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T10:30:00.000Z",
      "updatedAt": "2026-04-11T10:30:00.000Z",
      "deletedAt": null,
      "user": {
        "firstName": "Priya",
        "lastName": "Sharma",
        "email": "priya.sharma@example.com",
        "role": "student",
        "isActive": true,
        "isDeleted": false
      },
      "level": {
        "id": 3,
        "name": "Bachelor's Degree",
        "abbreviation": "B.Tech",
        "levelOrder": 30,
        "levelCategory": "undergraduate",
        "typicalDuration": "4 years",
        "isActive": true,
        "isDeleted": false
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 403 Forbidden — caller lacks `user_education.read`

```json
{
  "success": false,
  "message": "Missing required permission: user_education.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-education` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across institution / field / description / user name / email | `?searchTerm=iit` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=computer%20science` |
| Single user — all rows | `?userId=42` |
| Single user — top 5 recent | `?userId=42&pageIndex=1&pageSize=5&sortColumn=end_date&sortDirection=DESC` |
| Filter by education level | `?educationLevelId=3` |
| Level category — school | `?levelCategory=school` |
| Level category — undergraduate | `?levelCategory=undergraduate` |
| Level category — postgraduate | `?levelCategory=postgraduate` |
| Level category — doctorate | `?levelCategory=doctorate` |
| Grade type — percentage | `?gradeType=percentage` |
| Grade type — cgpa | `?gradeType=cgpa` |
| Grade type — gpa | `?gradeType=gpa` |
| Grade type — grade | `?gradeType=grade` |
| Grade type — pass_fail | `?gradeType=pass_fail` |
| Grade type — other | `?gradeType=other` |
| Currently studying only | `?isCurrentlyStudying=true` |
| Not currently studying | `?isCurrentlyStudying=false` |
| Highest-qualification rows only | `?isHighest=true` |
| Non-highest-qualification rows | `?isHighest=false` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by user role — student | `?userRole=student` |
| Filter by user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — edu table — `id` DESC (default) | `?sortTable=edu&sortColumn=id&sortDirection=DESC` |
| Sort — edu table — `institution_name` ASC | `?sortTable=edu&sortColumn=institution_name&sortDirection=ASC` |
| Sort — edu table — `field_of_study` ASC | `?sortTable=edu&sortColumn=field_of_study&sortDirection=ASC` |
| Sort — edu table — `start_date` DESC | `?sortTable=edu&sortColumn=start_date&sortDirection=DESC` |
| Sort — edu table — `end_date` DESC | `?sortTable=edu&sortColumn=end_date&sortDirection=DESC` |
| Sort — edu table — `grade_type` ASC | `?sortTable=edu&sortColumn=grade_type&sortDirection=ASC` |
| Sort — edu table — `is_active` DESC | `?sortTable=edu&sortColumn=is_active&sortDirection=DESC` |
| Sort — edu table — `is_deleted` DESC | `?sortTable=edu&sortColumn=is_deleted&sortDirection=DESC` |
| Sort — edu table — `created_at` DESC | `?sortTable=edu&sortColumn=created_at&sortDirection=DESC` |
| Sort — edu table — `updated_at` DESC | `?sortTable=edu&sortColumn=updated_at&sortDirection=DESC` |
| Sort — level table — `name` ASC | `?sortTable=level&sortColumn=name&sortDirection=ASC` |
| Sort — level table — `level_order` ASC | `?sortTable=level&sortColumn=level_order&sortDirection=ASC` |
| Sort — level table — `category` ASC | `?sortTable=level&sortColumn=category&sortDirection=ASC` |
| Sort — user table — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user table — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user table — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user table — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — active undergraduate rows, sort newest | `?pageIndex=1&pageSize=50&isActive=true&levelCategory=undergraduate&sortTable=edu&sortColumn=start_date&sortDirection=DESC` |
| Combo — `iit` search, currently studying, newest | `?pageIndex=1&pageSize=20&searchTerm=iit&isCurrentlyStudying=true&sortTable=edu&sortColumn=created_at&sortDirection=DESC` |
| Combo — one user's highest qualifications | `?userId=42&isHighest=true&sortTable=level&sortColumn=level_order&sortDirection=DESC` |

> The `sortTable` param defaults to `edu`. When sorting by a column that belongs to a different join source (e.g. `name` lives on `education_levels`, `first_name` lives on `users`), set `sortTable` to `level` or `user` so the UDF picks the right qualified reference.

---

## 2.2 `GET /api/v1/user-education/me`

Return the caller's own education rows. Server-side forces `userId = req.user.id`, so callers cannot peek at another user's rows by omitting the filter.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-education/me` |
| Permission | `user_education.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params** — same as §2.1 except `userId` is ignored (forced to caller).

### Responses

#### 200 OK

Same envelope and row shape as §2.1. Empty `data` array when the caller has no rows yet.

#### 403 Forbidden — caller lacks `user_education.read.own`

Service accounts that only hold global `user_education.read` will be rejected here — they should call `/` instead.

---

## 2.3 `POST /api/v1/user-education/me`

Self-service create. `userId` is derived from `req.user.id`; any attempt to set it in the body is ignored by zod.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-education/me` |
| Permission | `user_education.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body**

```json
{
  "educationLevelId": 3,
  "institutionName": "IIT Bombay",
  "boardOrUniversity": "Indian Institute of Technology",
  "fieldOfStudy": "Computer Science",
  "specialization": "Machine Learning",
  "gradeOrPercentage": "9.1",
  "gradeType": "cgpa",
  "startDate": "2018-08-01",
  "endDate": "2022-06-30",
  "isCurrentlyStudying": false,
  "isHighestQualification": true,
  "certificateUrl": "https://cdn.growupmore.com/certs/42/btech.pdf",
  "description": "B.Tech in CS, graduated with honors."
}
```

**Required:** `educationLevelId`, `institutionName`. Every other field is optional.

**Cross-field rules:**

- `endDate >= startDate` when both are provided.
- `endDate` must be empty when `isCurrentlyStudying = true`.

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Education record created",
  "data": { /* full UserEducationDto */ }
}
```

#### 400 Validation error

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["endDate"], "message": "endDate cannot be before startDate" }
  ]
}
```

#### 400 Bad request — FK validation

```json
{
  "success": false,
  "message": "Error inserting user education: Education level id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 2.4 `PATCH /api/v1/user-education/me/:id`

Self-service partial update. The router first fetches the row and rejects with `403 FORBIDDEN` if `row.userId !== req.user.id`, so one student cannot edit another student's record even if they guess the id.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-education/me/:id` |
| Permission | `user_education.update.own` |

**Request body** — any subset of the create fields. Example:

```json
{
  "gradeOrPercentage": "9.3",
  "description": "B.Tech in CS — graduated with distinction."
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Education record updated",
  "data": { /* full UserEducationDto */ }
}
```

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": [], "message": "Provide at least one field to update" }
  ]
}
```

#### 403 Forbidden — editing someone else's row

```json
{
  "success": false,
  "message": "You can only edit your own education records.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Education record 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 2.5 `DELETE /api/v1/user-education/me/:id`

Self-service soft-delete. Sets `is_deleted=true`, `is_active=false`, `deleted_at=now()`. The row is immediately hidden from the caller's `GET /me`.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-education/me/:id` |
| Permission | `user_education.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Education record deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — deleting someone else's row

```json
{
  "success": false,
  "message": "You can only delete your own education records.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Education record 42 not found",
  "code": "NOT_FOUND"
}
```

> Instructors and students have **no restore path**. If a student soft-deletes a row by mistake they must ask an admin to restore it via §2.10.

---

## 2.6 `GET /api/v1/user-education/:id`

Get one row by id. Uses `authorizeSelfOr`: admins with `user_education.read` pass unconditionally; students/instructors with only `user_education.read.own` pass only if the row belongs to them.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-education/:id` |
| Permission | `user_education.read` *or* `user_education.read.own` |

### Responses

#### 200 OK

Single `UserEducationDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_education.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, **or** is soft-deleted (admin-audit view must pass `isDeleted=true` via the list endpoint instead).

---

## 2.7 `POST /api/v1/user-education`

Admin create — body requires `userId` explicitly, so admins can create rows on behalf of any student/instructor.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-education` |
| Permission | `user_education.create` |

**Request body**

```json
{
  "userId": 42,
  "educationLevelId": 2,
  "institutionName": "Delhi Public School",
  "boardOrUniversity": "CBSE",
  "fieldOfStudy": "Science",
  "gradeOrPercentage": "92",
  "gradeType": "percentage",
  "startDate": "2016-04-01",
  "endDate": "2018-03-31",
  "isCurrentlyStudying": false,
  "isHighestQualification": false
}
```

### Responses

#### 201 Created

Same shape as §2.3.

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user education: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 2.8 `PATCH /api/v1/user-education/:id`

`authorizeSelfOr` lets admins edit any row and lets students/instructors edit their own.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-education/:id` |
| Permission | `user_education.update` *or* `user_education.update.own` |

**Request body** — any subset of the full field set. Same cross-field rules as §2.3 (the UDF re-validates the merged `start_date`/`end_date`/`isCurrentlyStudying` triplet).

### Responses

#### 200 OK

Full updated `UserEducationDto`.

#### 403 Forbidden — own-scope on a foreign row

Same shape as §2.6.

#### 400 Bad request

```json
{
  "success": false,
  "message": "Error updating user education: endDate cannot be before startDate.",
  "code": "BAD_REQUEST"
}
```

---

## 2.9 `DELETE /api/v1/user-education/:id`

Soft-delete — same as §2.5 but accessible to admins for any row.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-education/:id` |
| Permission | `user_education.delete` *or* `user_education.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Education record deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — unknown id

```json
{
  "success": false,
  "message": "Error deleting user education: No user education row found with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 2.10 `POST /api/v1/user-education/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. Before calling the UDF, the route uses the `getByIdIncludingDeleted` service helper to surface a clean `404` (row missing) or `400` (row not deleted) — both are easier to handle client-side than the lower-level UDF error.

The UDF also validates that the **owning user** is still active and that the referenced `education_levels` row is still active. If either parent is deleted, the restore fails with a `400`.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-education/:id/restore` |
| Permission | `user_education.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Education record restored",
  "data": { /* full UserEducationDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "Education record 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user education: Owning user 42 is deleted; restore user first.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_education.restore`

Students and instructors always land here — they have no restore permission.

```json
{
  "success": false,
  "message": "Missing required permission: user_education.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Education record 42 not found",
  "code": "NOT_FOUND"
}
```

---

## DTO reference

The full `UserEducationDto` definition lives in [`api/src/modules/user-education/user-education.service.ts`](../../../api/src/modules/user-education/user-education.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId`, `educationLevelId` | Primary key + FKs. |
| `institutionName`, `boardOrUniversity`, `fieldOfStudy`, `specialization` | Institution details. |
| `gradeOrPercentage`, `gradeType` | Grade + type enum (`percentage` / `cgpa` / `gpa` / `grade` / `pass_fail` / `other`). |
| `startDate`, `endDate`, `isCurrentlyStudying` | Duration. `endDate` null iff currently studying. |
| `isHighestQualification` | Marks the primary row — one per user by convention. |
| `certificateUrl`, `description` | Optional long-form details. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary — first/last name, email, role, status. |
| `level` | Nested level lookup — name, abbreviation, level order, category, typical duration. |

← [01 user-profiles](01%20-%20user-profiles.md) · **Next →** [03 user-experience](03%20-%20user-experience.md)
