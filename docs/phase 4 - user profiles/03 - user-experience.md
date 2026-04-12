# Phase 4 — User Experience

`user_experience` is the **professional history** counterpart to `user_education`: one row per job, internship, freelance engagement, or volunteer stint. The row optionally references `designations` (a phase-02 master-data lookup) so the admin views can group by seniority band, but the FK is nullable — users can log a job even when the designation master row doesn't exist yet.

Same 1:M child-of-users shape as `user_education`, same **soft-delete + admin restore** model, same `/me` + `/:id` split. If you've read [§2](02%20-%20user-education.md) you already know the structure of this module.

All routes require auth. Permission codes: `user_experience.create`, `user_experience.read`, `user_experience.read.own`, `user_experience.update`, `user_experience.update.own`, `user_experience.delete`, `user_experience.delete.own`, `user_experience.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [02 user-education](02%20-%20user-education.md) · **Next →** [04 user-social-medias](04%20-%20user-social-medias.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31-get-apiv1user-experience) | `GET` | `{{baseUrl}}/api/v1/user-experience` | `user_experience.read` | List all experience rows (admin+). |
| [§3.2](#32-get-apiv1user-experienceme) | `GET` | `{{baseUrl}}/api/v1/user-experience/me` | `user_experience.read.own` | List caller's own experience rows. |
| [§3.3](#33-post-apiv1user-experienceme) | `POST` | `{{baseUrl}}/api/v1/user-experience/me` | `user_experience.update.own` | Self-service create — `userId` derived from token. |
| [§3.4](#34-patch-apiv1user-experiencemeid) | `PATCH` | `{{baseUrl}}/api/v1/user-experience/me/:id` | `user_experience.update.own` (self match enforced) | Self-service partial update. |
| [§3.5](#35-delete-apiv1user-experiencemeid) | `DELETE` | `{{baseUrl}}/api/v1/user-experience/me/:id` | `user_experience.delete.own` (self match enforced) | Self-service soft-delete. |
| [§3.6](#36-get-apiv1user-experienceid) | `GET` | `{{baseUrl}}/api/v1/user-experience/:id` | `user_experience.read` *or* `user_experience.read.own` (+ self match) | Get one row by id. |
| [§3.7](#37-post-apiv1user-experience) | `POST` | `{{baseUrl}}/api/v1/user-experience` | `user_experience.create` | Admin create — targets any `userId`. |
| [§3.8](#38-patch-apiv1user-experienceid) | `PATCH` | `{{baseUrl}}/api/v1/user-experience/:id` | `user_experience.update` *or* `user_experience.update.own` (+ self match) | Admin or self partial update. |
| [§3.9](#39-delete-apiv1user-experienceid) | `DELETE` | `{{baseUrl}}/api/v1/user-experience/:id` | `user_experience.delete` *or* `user_experience.delete.own` (+ self match) | Admin or self soft-delete. |
| [§3.10](#310-post-apiv1user-experienceidrestore) | `POST` | `{{baseUrl}}/api/v1/user-experience/:id/restore` | `user_experience.restore` (admin+) | Un-soft-delete a hidden row. |

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete and restore. |
| Admin | Everything **except** the global `user_experience.delete` (admin still has `delete.own` and `restore`). |
| Instructor / Student | Self only — `read.own`, `update.own`, `delete.own`. No restore. |

### Enum reference

Three CHECK-constrained enum columns drive the experience row:

| Column | Values |
|---|---|
| `employmentType` | `full_time` · `part_time` · `contract` · `internship` · `freelance` · `self_employed` · `volunteer` · `apprenticeship` · `other` |
| `workMode` | `on_site` · `remote` · `hybrid` |
| `designation.levelBand` *(joined, read-only)* | `entry` · `junior` · `mid` · `senior` · `lead` · `executive` |

---

## 3.1 `GET /api/v1/user-experience`

List experience rows. Backed by `udf_get_user_experience`, which joins `user_experience` → `users` → `designations` (nullable). Hides soft-deleted rows by default.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-experience` |
| Permission | `user_experience.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `designationId` | bigint | — | Filter by designation (nullable FK). |
| `employmentType` | enum | — | See enum reference above. |
| `workMode` | enum | — | `on_site` / `remote` / `hybrid`. |
| `levelBand` | enum | — | Filter by joined `designations.level_band`. |
| `isCurrentJob` | bool | — | `true` = only ongoing roles. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted rows (admin audit view). |
| `userRole` | string | — | Parent user's role code. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across company, job title, department, location, description, achievements, skills used, first/last name, email. |
| `sortTable` | enum | `exp` | `exp` / `designation` / `user`. |
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
      "id": 7,
      "userId": 42,
      "designationId": 11,
      "companyName": "Acme Corp",
      "jobTitle": "Senior Software Engineer",
      "employmentType": "full_time",
      "department": "Platform",
      "location": "Bengaluru, KA",
      "workMode": "hybrid",
      "startDate": "2022-07-01",
      "endDate": null,
      "isCurrentJob": true,
      "description": "Owning the checkout service.",
      "keyAchievements": "Reduced p95 latency by 40%.",
      "skillsUsed": "TypeScript, Postgres, Redis, Kafka",
      "salaryRange": "INR 30-40 LPA",
      "referenceName": "Anita Rao",
      "referencePhone": "+91 98765 43210",
      "referenceEmail": "anita.rao@acme.example",
      "createdBy": 42,
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
      "designation": {
        "id": 11,
        "name": "Senior Software Engineer",
        "code": "SSE",
        "level": 3,
        "levelBand": "senior",
        "isActive": true,
        "isDeleted": false
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: user_experience.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-experience` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across company / job title / department / description / user name | `?searchTerm=google` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=backend` |
| Single user — all rows | `?userId=42` |
| Single user — current job only | `?userId=42&isCurrentJob=true` |
| Filter by designation | `?designationId=7` |
| Employment type — full_time | `?employmentType=full_time` |
| Employment type — part_time | `?employmentType=part_time` |
| Employment type — contract | `?employmentType=contract` |
| Employment type — internship | `?employmentType=internship` |
| Employment type — freelance | `?employmentType=freelance` |
| Employment type — self_employed | `?employmentType=self_employed` |
| Employment type — volunteer | `?employmentType=volunteer` |
| Employment type — apprenticeship | `?employmentType=apprenticeship` |
| Employment type — other | `?employmentType=other` |
| Work mode — on_site | `?workMode=on_site` |
| Work mode — remote | `?workMode=remote` |
| Work mode — hybrid | `?workMode=hybrid` |
| Level band — entry | `?levelBand=entry` |
| Level band — junior | `?levelBand=junior` |
| Level band — mid | `?levelBand=mid` |
| Level band — senior | `?levelBand=senior` |
| Level band — lead | `?levelBand=lead` |
| Level band — executive | `?levelBand=executive` |
| Current job only | `?isCurrentJob=true` |
| Past jobs only | `?isCurrentJob=false` |
| Active rows only | `?isActive=true` |
| Inactive rows only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by parent user role — student | `?userRole=student` |
| Filter by parent user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — exp table — `id` DESC (default) | `?sortTable=exp&sortColumn=id&sortDirection=DESC` |
| Sort — exp table — `company_name` ASC | `?sortTable=exp&sortColumn=company_name&sortDirection=ASC` |
| Sort — exp table — `job_title` ASC | `?sortTable=exp&sortColumn=job_title&sortDirection=ASC` |
| Sort — exp table — `employment_type` ASC | `?sortTable=exp&sortColumn=employment_type&sortDirection=ASC` |
| Sort — exp table — `work_mode` ASC | `?sortTable=exp&sortColumn=work_mode&sortDirection=ASC` |
| Sort — exp table — `start_date` DESC | `?sortTable=exp&sortColumn=start_date&sortDirection=DESC` |
| Sort — exp table — `end_date` DESC | `?sortTable=exp&sortColumn=end_date&sortDirection=DESC` |
| Sort — exp table — `is_active` DESC | `?sortTable=exp&sortColumn=is_active&sortDirection=DESC` |
| Sort — exp table — `is_deleted` DESC | `?sortTable=exp&sortColumn=is_deleted&sortDirection=DESC` |
| Sort — exp table — `created_at` DESC | `?sortTable=exp&sortColumn=created_at&sortDirection=DESC` |
| Sort — exp table — `updated_at` DESC | `?sortTable=exp&sortColumn=updated_at&sortDirection=DESC` |
| Sort — designation — `name` ASC | `?sortTable=designation&sortColumn=name&sortDirection=ASC` |
| Sort — designation — `level` ASC | `?sortTable=designation&sortColumn=level&sortDirection=ASC` |
| Sort — designation — `level_band` ASC | `?sortTable=designation&sortColumn=level_band&sortDirection=ASC` |
| Sort — user — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — senior remote roles, newest | `?pageIndex=1&pageSize=20&levelBand=senior&workMode=remote&sortTable=exp&sortColumn=start_date&sortDirection=DESC` |
| Combo — full-time current jobs, alphabetic by company | `?pageIndex=1&pageSize=50&employmentType=full_time&isCurrentJob=true&sortTable=exp&sortColumn=company_name&sortDirection=ASC` |
| Combo — search `google`, entry-level, newest first | `?pageIndex=1&pageSize=20&searchTerm=google&levelBand=entry&sortTable=exp&sortColumn=start_date&sortDirection=DESC` |

> The `sortTable` param defaults to `exp`. When sorting by a column that belongs to a different join source (`name`, `level`, `level_band` live on `designations`; `first_name` / `last_name` / `email` / `role` live on `users`), set `sortTable` to `designation` or `user`.

---

## 3.2 `GET /api/v1/user-experience/me`

List the caller's own experience rows. `userId` filter is forced server-side.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-experience/me` |
| Permission | `user_experience.read.own` |

### Responses

#### 200 OK

Same shape as §3.1. Empty `data` array when the caller has no rows yet.

---

## 3.3 `POST /api/v1/user-experience/me`

Self-service create. `userId` is derived from the token.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-experience/me` |
| Permission | `user_experience.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body**

```json
{
  "companyName": "Acme Corp",
  "jobTitle": "Senior Software Engineer",
  "startDate": "2022-07-01",
  "employmentType": "full_time",
  "department": "Platform",
  "location": "Bengaluru, KA",
  "workMode": "hybrid",
  "isCurrentJob": true,
  "description": "Owning the checkout service.",
  "keyAchievements": "Reduced p95 latency by 40%.",
  "skillsUsed": "TypeScript, Postgres, Redis, Kafka",
  "designationId": 11,
  "referenceName": "Anita Rao",
  "referencePhone": "+91 98765 43210",
  "referenceEmail": "anita.rao@acme.example"
}
```

**Required:** `companyName`, `jobTitle`, `startDate`. Every other field is optional.

**Cross-field rules:**

- `endDate >= startDate` when both are provided.
- `endDate` must be empty when `isCurrentJob = true`.

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Experience record created",
  "data": { /* full UserExperienceDto */ }
}
```

#### 400 Validation error

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["endDate"], "message": "endDate must be empty when isCurrentJob is true" }
  ]
}
```

#### 400 Bad request — FK validation

```json
{
  "success": false,
  "message": "Error inserting user experience: Designation id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 3.4 `PATCH /api/v1/user-experience/me/:id`

Self-service partial update.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-experience/me/:id` |
| Permission | `user_experience.update.own` |

**Request body** — any subset of the create fields. Example:

```json
{
  "jobTitle": "Staff Software Engineer",
  "description": "Promoted to Staff, now leading Payments."
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Experience record updated",
  "data": { /* full UserExperienceDto */ }
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

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only edit your own experience records.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Experience record 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 3.5 `DELETE /api/v1/user-experience/me/:id`

Self-service soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-experience/me/:id` |
| Permission | `user_experience.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Experience record deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only delete your own experience records.",
  "code": "FORBIDDEN"
}
```

> No self-restore — see §3.10 for the admin restore path.

---

## 3.6 `GET /api/v1/user-experience/:id`

Get one row by id. `authorizeSelfOr` pattern — same as §2.6.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-experience/:id` |
| Permission | `user_experience.read` *or* `user_experience.read.own` |

### Responses

#### 200 OK

Single `UserExperienceDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_experience.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, or is soft-deleted.

---

## 3.7 `POST /api/v1/user-experience`

Admin create — body requires `userId` explicitly.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-experience` |
| Permission | `user_experience.create` |

**Request body**

```json
{
  "userId": 42,
  "companyName": "Initech",
  "jobTitle": "Software Engineer",
  "startDate": "2020-06-01",
  "endDate": "2022-06-30",
  "employmentType": "full_time",
  "workMode": "on_site",
  "isCurrentJob": false,
  "designationId": 9
}
```

### Responses

#### 201 Created

Same shape as §3.3.

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user experience: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 3.8 `PATCH /api/v1/user-experience/:id`

`authorizeSelfOr` — admins edit any row, self edits own row.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-experience/:id` |
| Permission | `user_experience.update` *or* `user_experience.update.own` |

### Responses

#### 200 OK

Full updated `UserExperienceDto`.

#### 403 Forbidden — own-scope on a foreign row

Same shape as §3.6.

#### 400 Bad request

```json
{
  "success": false,
  "message": "Error updating user experience: endDate cannot be before startDate.",
  "code": "BAD_REQUEST"
}
```

---

## 3.9 `DELETE /api/v1/user-experience/:id`

Admin or self soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-experience/:id` |
| Permission | `user_experience.delete` *or* `user_experience.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Experience record deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — unknown id

```json
{
  "success": false,
  "message": "Error deleting user experience: No user experience row found with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 3.10 `POST /api/v1/user-experience/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. The route uses `getByIdIncludingDeleted` to surface a clean `404` / `400` before the UDF runs.

The UDF validates that the owning user is active. Unlike `user_education`, the `designationId` FK is **nullable**, so the restore only checks the designation's active state when it is non-null.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-experience/:id/restore` |
| Permission | `user_experience.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Experience record restored",
  "data": { /* full UserExperienceDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "Experience record 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user experience: Owning user 42 is deleted; restore user first.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_experience.restore`

```json
{
  "success": false,
  "message": "Missing required permission: user_experience.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Experience record 42 not found",
  "code": "NOT_FOUND"
}
```

---

## DTO reference

The full `UserExperienceDto` definition lives in [`api/src/modules/user-experience/user-experience.service.ts`](../../../api/src/modules/user-experience/user-experience.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId`, `designationId` | Primary key + FKs (designation is nullable). |
| `companyName`, `jobTitle`, `department`, `location` | Position details. |
| `employmentType`, `workMode` | Enum classification. |
| `startDate`, `endDate`, `isCurrentJob` | Duration. `endDate` null iff `isCurrentJob`. |
| `description`, `keyAchievements`, `skillsUsed` | Long-form narrative fields. |
| `salaryRange`, `referenceName`, `referencePhone`, `referenceEmail` | Optional compensation + reference info. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary. |
| `designation` | Nested designation lookup (nullable). Includes `levelBand` for seniority grouping. |

← [02 user-education](02%20-%20user-education.md) · **Next →** [04 user-social-medias](04%20-%20user-social-medias.md)
