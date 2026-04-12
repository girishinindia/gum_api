# Phase 4 — User Projects

`user_projects` is a **1:M child of `users`** that stores the portfolio entries a user has built up — personal side projects, academic coursework, client engagements, hackathon submissions, open-source contributions, research work, and anything else a student wants to surface on their profile. It's the richest of the phase-04 child tables: ~45 columns covering the whole project lifecycle (title, type, status, role, team, tech stack, dates, outcomes, URLs, references, recognition flags).

Unlike [§7 `user_documents`](07%20-%20user-documents.md), `user_projects` has **no admin-only workflow fields**. There's no verification state machine — `isFeatured` and `isPublished` are student-settable recognition flags, not admin-gated approvals. The practical consequence is that the admin and self lanes share a **single body schema**: whatever the student can PATCH on `/me/:id`, an admin can PATCH on `/:id`. The only thing the admin lane adds is the ability to target a different `userId` on create.

What `user_projects` does add that other phase-04 child tables don't is a pair of **cross-field refinements** that fire at the Zod layer on both create AND update:

1. `endDate` must be on or after `startDate`.
2. `isOngoing: true` cannot coexist with a set `endDate`.

Both validations live in `validateDateRange` / `validateOngoingNoEnd` inside `user-projects.schemas.ts` and apply identically to all three body schemas (`create`, `createMy`, `update`). The UDF layer re-validates against the effective row state, so partial updates that supply only one side of the pair are still correctly checked against whatever's already on disk.

Same **soft-delete + admin restore** model as `user_languages` / `user_documents`, same `/me` + `/:id` split. If you've read [§7](07%20-%20user-documents.md) the shape will feel identical; the interesting differences are the field set and the cross-field validations.

All routes require auth. Permission codes use the **singular** resource name `user_project`: `user_project.create`, `user_project.read`, `user_project.read.own`, `user_project.update`, `user_project.update.own`, `user_project.delete`, `user_project.delete.own`, `user_project.restore`.

> The table name is plural (`user_projects`) but the permission resource is singular (`user_project`). The API path mirrors the table name: `/api/v1/user-projects`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [07 user-documents](07%20-%20user-documents.md) · **Next →** _TBD_

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§8.1](#81-get-apiv1user-projects) | `GET` | `{{baseUrl}}/api/v1/user-projects` | `user_project.read` | List all user-project rows (admin+). |
| [§8.2](#82-get-apiv1user-projectsme) | `GET` | `{{baseUrl}}/api/v1/user-projects/me` | `user_project.read.own` | List caller's own project rows. |
| [§8.3](#83-post-apiv1user-projectsme) | `POST` | `{{baseUrl}}/api/v1/user-projects/me` | `user_project.update.own` | Self-service create — `userId` derived from token. |
| [§8.4](#84-patch-apiv1user-projectsmeid) | `PATCH` | `{{baseUrl}}/api/v1/user-projects/me/:id` | `user_project.update.own` (self match enforced) | Self-service partial update. |
| [§8.5](#85-delete-apiv1user-projectsmeid) | `DELETE` | `{{baseUrl}}/api/v1/user-projects/me/:id` | `user_project.delete.own` (self match enforced) | Self-service soft-delete. |
| [§8.6](#86-get-apiv1user-projectsid) | `GET` | `{{baseUrl}}/api/v1/user-projects/:id` | `user_project.read` *or* `user_project.read.own` (+ self match) | Get one row by id. |
| [§8.7](#87-post-apiv1user-projects) | `POST` | `{{baseUrl}}/api/v1/user-projects` | `user_project.create` | Admin create — targets any `userId`. |
| [§8.8](#88-patch-apiv1user-projectsid) | `PATCH` | `{{baseUrl}}/api/v1/user-projects/:id` | `user_project.update` *or* `user_project.update.own` (+ self match) | Admin or self partial update. |
| [§8.9](#89-delete-apiv1user-projectsid) | `DELETE` | `{{baseUrl}}/api/v1/user-projects/:id` | `user_project.delete` *or* `user_project.delete.own` (+ self match) | Admin or self soft-delete. |
| [§8.10](#810-post-apiv1user-projectsidrestore) | `POST` | `{{baseUrl}}/api/v1/user-projects/:id/restore` | `user_project.restore` (admin+) | Un-soft-delete a hidden row. |
| [§8.11](#811-cross-field-validations) | — | — | — | The `endDate`/`startDate` and `isOngoing`/`endDate` refinements, end-to-end. |

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete and restore. |
| Admin | Everything **except** the global `user_project.delete` (admin still has `delete.own` and `restore`). |
| Instructor / Student | Self only — `read.own`, `update.own`, `delete.own`. No restore. |

> Unlike `user_documents`, there are no extra body-field restrictions for the self lane. Students can set every column on the table — `isFeatured`, `isPublished`, `awards`, `certifications`, `referenceEmail`, etc. The recognition flags are not admin-gated.

### `projectType` reference

The `projectType` column is constrained to the values below — both the DB CHECK constraint and the Zod `projectTypeSchema` reject anything else.

| Value | Intended meaning |
|---|---|
| `personal` | Side project built in the user's own time. |
| `academic` | Coursework, capstone, thesis, lab assignment. |
| `professional` | Work delivered as a salaried employee. |
| `freelance` | Paid contract work outside permanent employment. |
| `open_source` | Contribution to a public OSS project. |
| `research` | Structured research / publication work. |
| `hackathon` | Hackathon / jam / competition submission. |
| `internship` | Work delivered during a formal internship. |
| `client` | Agency-style client engagement. |
| `government` | Work delivered for a public-sector customer. |
| `ngo` | Work delivered for a non-profit. |
| `other` | Anything that doesn't fit the above. |

### `projectStatus` reference

| Value | Intended meaning |
|---|---|
| `planning` | Scoped but not yet started. |
| `in_progress` | Active work. Usually paired with `isOngoing=true`. |
| `completed` | Shipped / delivered. |
| `on_hold` | Temporarily paused; expected to resume. |
| `cancelled` | Formally stopped; will not resume. |
| `abandoned` | Quietly stopped; distinction from `cancelled` is intent. |

---

## 8.1 `GET /api/v1/user-projects`

List user-project rows. Backed by `udf_get_user_projects`, which joins `user_projects` → `users`. Hides soft-deleted rows by default.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-projects` |
| Permission | `user_project.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `projectType` | enum | — | See the `projectType` reference above. |
| `projectStatus` | enum | — | See the `projectStatus` reference above. |
| `industry` | string | — | Case-insensitive match on the `industry` column. |
| `isOngoing` | bool | — | Flag used together with null `endDate`. |
| `isFeatured` | bool | — | Student-settable recognition flag. |
| `isPublished` | bool | — | Student-settable visibility flag. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted rows (admin audit view). |
| `userRole` | string | — | Parent user's role code. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across project title, code, organization, client, industry, role, tech-stack strings, parent user name + email. |
| `sortTable` | enum | `proj` | `proj` / `user`. |
| `sortColumn` | enum | `id` | See `user-projects.schemas.ts` for the full allowlist. |
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
      "projectTitle": "GrowUpMore LMS — Quiz Engine",
      "projectCode": "GUM-Q1",
      "projectType": "professional",
      "description": "Adaptive quiz engine with spaced-repetition scheduling.",
      "objectives": "Raise retention of graded quizzes by 20%.",
      "roleInProject": "Tech Lead",
      "responsibilities": "Architecture, DB schema, code review, release.",
      "teamSize": 4,
      "isSoloProject": false,
      "organizationName": "GrowUpMore Pvt Ltd",
      "clientName": null,
      "industry": "EdTech",
      "technologiesUsed": "PostgreSQL, Node.js, Express, Zod",
      "toolsUsed": "Postman, DBeaver, Grafana",
      "programmingLanguages": "TypeScript, SQL",
      "frameworks": "Express, Zod",
      "databasesUsed": "PostgreSQL, Redis",
      "platform": "Web",
      "startDate": "2025-09-01",
      "endDate": null,
      "isOngoing": true,
      "durationMonths": 7,
      "projectStatus": "in_progress",
      "keyAchievements": "Shipped v1 to 1200 students in week 6.",
      "challengesFaced": "Migration from legacy MySQL was non-trivial.",
      "lessonsLearned": "Write the restore path first, not last.",
      "impactSummary": "Quiz retention up 27% in cohort A.",
      "usersServed": "1,200 active students",
      "projectUrl": "https://growupmore.example.com/quiz",
      "repositoryUrl": "https://github.com/growupmore/quiz-engine",
      "demoUrl": "https://demo.growupmore.example.com/quiz",
      "documentationUrl": "https://docs.growupmore.example.com/quiz",
      "thumbnailUrl": "https://cdn.growupmore.example.com/thumbs/quiz.webp",
      "caseStudyUrl": null,
      "isFeatured": true,
      "isPublished": true,
      "awards": "Best Internal Tool — 2025 Eng All-Hands.",
      "certifications": null,
      "referenceName": "Priya Sharma",
      "referenceEmail": "priya.sharma@example.com",
      "referencePhone": "+91 98765 43210",
      "displayOrder": 1,
      "createdBy": 42,
      "updatedBy": 42,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2025-09-01T05:00:00.000Z",
      "updatedAt": "2026-04-10T09:00:00.000Z",
      "deletedAt": null,
      "user": {
        "firstName": "Priya",
        "lastName": "Sharma",
        "email": "priya.sharma@example.com",
        "role": "student",
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
  "message": "Missing required permission: user_project.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-projects` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across title / code / org / client / industry / role / tech strings / user name / email | `?searchTerm=quiz` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=react` |
| Single user — all rows | `?userId=42` |
| Single user — ongoing projects | `?userId=42&isOngoing=true` |
| Project type — personal | `?projectType=personal` |
| Project type — academic | `?projectType=academic` |
| Project type — professional | `?projectType=professional` |
| Project type — freelance | `?projectType=freelance` |
| Project type — open_source | `?projectType=open_source` |
| Project type — research | `?projectType=research` |
| Project type — hackathon | `?projectType=hackathon` |
| Project type — internship | `?projectType=internship` |
| Project type — client | `?projectType=client` |
| Project type — government | `?projectType=government` |
| Project type — ngo | `?projectType=ngo` |
| Project type — other | `?projectType=other` |
| Project status — planning | `?projectStatus=planning` |
| Project status — in_progress | `?projectStatus=in_progress` |
| Project status — completed | `?projectStatus=completed` |
| Project status — on_hold | `?projectStatus=on_hold` |
| Project status — cancelled | `?projectStatus=cancelled` |
| Project status — abandoned | `?projectStatus=abandoned` |
| Industry filter | `?industry=EdTech` |
| Ongoing projects only | `?isOngoing=true` |
| Non-ongoing projects | `?isOngoing=false` |
| Featured only | `?isFeatured=true` |
| Non-featured only | `?isFeatured=false` |
| Published only | `?isPublished=true` |
| Unpublished only | `?isPublished=false` |
| Active rows only | `?isActive=true` |
| Inactive rows only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by parent user role — student | `?userRole=student` |
| Filter by parent user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — proj table — `id` DESC (default) | `?sortTable=proj&sortColumn=id&sortDirection=DESC` |
| Sort — proj table — `project_title` ASC | `?sortTable=proj&sortColumn=project_title&sortDirection=ASC` |
| Sort — proj table — `project_type` ASC | `?sortTable=proj&sortColumn=project_type&sortDirection=ASC` |
| Sort — proj table — `project_status` ASC | `?sortTable=proj&sortColumn=project_status&sortDirection=ASC` |
| Sort — proj table — `organization_name` ASC | `?sortTable=proj&sortColumn=organization_name&sortDirection=ASC` |
| Sort — proj table — `industry` ASC | `?sortTable=proj&sortColumn=industry&sortDirection=ASC` |
| Sort — proj table — `start_date` DESC | `?sortTable=proj&sortColumn=start_date&sortDirection=DESC` |
| Sort — proj table — `end_date` DESC | `?sortTable=proj&sortColumn=end_date&sortDirection=DESC` |
| Sort — proj table — `is_ongoing` DESC | `?sortTable=proj&sortColumn=is_ongoing&sortDirection=DESC` |
| Sort — proj table — `is_featured` DESC | `?sortTable=proj&sortColumn=is_featured&sortDirection=DESC` |
| Sort — proj table — `is_published` DESC | `?sortTable=proj&sortColumn=is_published&sortDirection=DESC` |
| Sort — proj table — `display_order` ASC | `?sortTable=proj&sortColumn=display_order&sortDirection=ASC` |
| Sort — proj table — `is_active` DESC | `?sortTable=proj&sortColumn=is_active&sortDirection=DESC` |
| Sort — proj table — `created_at` DESC | `?sortTable=proj&sortColumn=created_at&sortDirection=DESC` |
| Sort — proj table — `updated_at` DESC | `?sortTable=proj&sortColumn=updated_at&sortDirection=DESC` |
| Sort — user — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — completed professional projects, newest | `?pageIndex=1&pageSize=20&projectType=professional&projectStatus=completed&sortTable=proj&sortColumn=end_date&sortDirection=DESC` |
| Combo — featured published EdTech, by display order | `?pageIndex=1&pageSize=50&isFeatured=true&isPublished=true&industry=EdTech&sortTable=proj&sortColumn=display_order&sortDirection=ASC` |
| Combo — search `react`, ongoing hackathon, newest first | `?pageIndex=1&pageSize=20&searchTerm=react&projectType=hackathon&isOngoing=true&sortTable=proj&sortColumn=start_date&sortDirection=DESC` |
| Combo — one user's portfolio (featured, published, ordered) | `?userId=42&isFeatured=true&isPublished=true&sortTable=proj&sortColumn=display_order&sortDirection=ASC` |

> The `sortTable` param defaults to `proj`. `user_projects` only joins `users` (no master-data lookup table), so `sortTable` choices are `proj` or `user`.

---

## 8.2 `GET /api/v1/user-projects/me`

List the caller's own project rows. `userId` filter is forced server-side — any `userId` query param is ignored.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-projects/me` |
| Permission | `user_project.read.own` |

### Responses

#### 200 OK

Same shape as §8.1. Empty `data` array when the caller has no rows yet.

---

## 8.3 `POST /api/v1/user-projects/me`

Self-service create. `userId` is derived from the token. A single body schema covers this route — there is **no** admin/self split. Students set every field they want, including the recognition flags.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-projects/me` |
| Permission | `user_project.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body**

```json
{
  "projectTitle": "Portfolio Site v3",
  "projectType": "personal",
  "projectStatus": "in_progress",
  "description": "Rebuilt my personal portfolio on a headless CMS.",
  "roleInProject": "Full-stack developer",
  "teamSize": 1,
  "isSoloProject": true,
  "technologiesUsed": "Next.js, Tailwind, Payload CMS",
  "programmingLanguages": "TypeScript",
  "frameworks": "Next.js",
  "startDate": "2026-01-05",
  "isOngoing": true,
  "projectUrl": "https://priya.example.dev",
  "repositoryUrl": "https://github.com/priya/portfolio",
  "isFeatured": true,
  "isPublished": true,
  "displayOrder": 0
}
```

**Required:** `projectTitle`. Everything else is optional.

**Cross-field rules** — see [§8.11](#811-cross-field-validations). Both fire on this endpoint.

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "User project created",
  "data": { /* full UserProjectDto */ }
}
```

#### 400 Validation error — `endDate` before `startDate`

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

#### 400 Validation error — `isOngoing=true` with `endDate` set

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["endDate"], "message": "endDate must be empty when isOngoing is true" }
  ]
}
```

#### 400 Validation error — bad enum

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["projectType"], "message": "Invalid enum value. Expected 'personal' | 'academic' | ..." }
  ]
}
```

#### 400 Validation error — missing `projectTitle`

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["projectTitle"], "message": "Required" }
  ]
}
```

---

## 8.4 `PATCH /api/v1/user-projects/me/:id`

Self-service partial update. Same single body schema as §8.3 — no admin-field lockout because there are no admin-only fields. The empty-body refinement and both cross-field refinements fire here too.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-projects/me/:id` |
| Permission | `user_project.update.own` |

**Request body** — any subset of the create fields. Example finalizing an ongoing project:

```json
{
  "isOngoing": false,
  "endDate": "2026-04-01",
  "projectStatus": "completed",
  "keyAchievements": "Shipped v3.0 with full CMS migration."
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User project updated",
  "data": { /* full UserProjectDto */ }
}
```

> Partial updates only fire the cross-field refinements when **both** sides of the pair are present in the request body. If the client sends only `endDate` and the existing row has `isOngoing=true`, the Zod layer won't catch it — the UDF layer enforces the same rule against the effective row state and returns a `BAD_REQUEST`.

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

#### 400 Validation error — `endDate` / `isOngoing` conflict

Same shape as §8.3.

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only edit your own projects.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User project 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 8.5 `DELETE /api/v1/user-projects/me/:id`

Self-service soft-delete. The row is marked `is_deleted=TRUE, is_active=FALSE` and hidden from the default GET. Hard-delete is not exposed.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-projects/me/:id` |
| Permission | `user_project.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User project deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only delete your own projects.",
  "code": "FORBIDDEN"
}
```

> No self-restore — see §8.10 for the admin restore path.

---

## 8.6 `GET /api/v1/user-projects/:id`

Get one row by id. `authorizeSelfOr` pattern — admins read any row, self reads own row.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-projects/:id` |
| Permission | `user_project.read` *or* `user_project.read.own` |

### Responses

#### 200 OK

Single `UserProjectDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_project.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, or is soft-deleted.

---

## 8.7 `POST /api/v1/user-projects`

Admin create — body requires `userId` explicitly. Same field set as the `/me` variant plus the `userId` target.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-projects` |
| Permission | `user_project.create` |

**Request body**

```json
{
  "userId": 42,
  "projectTitle": "GrowUpMore LMS — Quiz Engine",
  "projectType": "professional",
  "projectStatus": "in_progress",
  "description": "Adaptive quiz engine with spaced-repetition scheduling.",
  "roleInProject": "Tech Lead",
  "teamSize": 4,
  "isSoloProject": false,
  "organizationName": "GrowUpMore Pvt Ltd",
  "industry": "EdTech",
  "technologiesUsed": "PostgreSQL, Node.js, Express, Zod",
  "startDate": "2025-09-01",
  "isOngoing": true,
  "isFeatured": true,
  "isPublished": true
}
```

### Responses

#### 201 Created

Same shape as §8.3.

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user project: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — parent user inactive

```json
{
  "success": false,
  "message": "Error inserting user project: Cannot create active user project: user id 42 is inactive.",
  "code": "BAD_REQUEST"
}
```

---

## 8.8 `PATCH /api/v1/user-projects/:id`

`authorizeSelfOr` — admins edit any row, self edits own row. Shares the same body schema as §8.4.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-projects/:id` |
| Permission | `user_project.update` *or* `user_project.update.own` |

**Request body** — any subset of the create fields. Example an admin bumping a featured project up the display order:

```json
{
  "displayOrder": 1,
  "isFeatured": true
}
```

### Responses

#### 200 OK

Full updated `UserProjectDto`.

#### 403 Forbidden — own-scope on a foreign row

Same shape as §8.6.

#### 400 Bad request — soft-deleted row

```json
{
  "success": false,
  "message": "Error updating user project: No active user project found with id 42.",
  "code": "BAD_REQUEST"
}
```

> The update UDF refuses to touch a soft-deleted row — restore it first via §8.10.

---

## 8.9 `DELETE /api/v1/user-projects/:id`

Admin or self soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-projects/:id` |
| Permission | `user_project.delete` *or* `user_project.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User project deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — already deleted / unknown id

```json
{
  "success": false,
  "message": "Error deleting user project: No active user project found to delete with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 8.10 `POST /api/v1/user-projects/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. The route uses `getByIdIncludingDeleted` to surface a clean `404` / `400` before the UDF runs.

The UDF validates the owning `users` row is still active and not deleted. If the parent user has been soft-deleted, un-delete them first via the users module.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-projects/:id/restore` |
| Permission | `user_project.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User project restored",
  "data": { /* full UserProjectDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "User project 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user project: Cannot restore user project 42: owning user 9 is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_project.restore`

```json
{
  "success": false,
  "message": "Missing required permission: user_project.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User project 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 8.11 Cross-field validations

`user_projects` enforces two cross-field rules at the Zod layer, shared across all three body schemas (`create`, `createMy`, `update`). They live in `user-projects.schemas.ts` as `validateDateRange` and `validateOngoingNoEnd` and are wired in via `.refine(...)` on each body schema.

**1. `endDate` must be on or after `startDate`.**

Fires when **both** fields are present in the body. The check is `new Date(endDate) >= new Date(startDate)`. Missing either side is a pass — the UDF layer re-checks against the effective row values on update, so partial updates are still covered.

**2. `isOngoing=true` cannot coexist with a set `endDate`.**

Fires when both fields are present in the same request. `isOngoing=true` means "still in progress" — having a concrete `endDate` alongside it is a contradiction. Either clear the `isOngoing` flag or clear the `endDate`.

### Create path

On `POST /api/v1/user-projects` and `POST /api/v1/user-projects/me`, both fields on each side of the pair are optional, so the refinement only fires when both are supplied. A client-side form that only collects `startDate` + `isOngoing` will never trigger either validation.

### Update path

On `PATCH /api/v1/user-projects/:id` and `PATCH /api/v1/user-projects/me/:id`, the refinement fires only when **both** sides of a pair are in the same PATCH body. That's why the service layer re-runs the check inside `udf_update_user_project` against the effective row — if the client only sends `endDate: "2026-04-01"` and the existing row has `isOngoing=true`, the Zod layer can't see the conflict but the UDF will catch it and return a `BAD_REQUEST`.

### Empty body

The update schemas additionally enforce `Object.keys(v).length > 0` — a PATCH with `{}` is a validation error:

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

### What is NOT validated cross-field

- `startDate` vs `createdAt` — a user can record a project that started before they joined the platform.
- `durationMonths` vs `startDate`/`endDate` — kept free-form so users can round to whole months regardless of exact dates.
- `teamSize` vs `isSoloProject` — kept advisory; a "solo project" with `teamSize: 1` and a "solo project" with `teamSize: null` are both valid.
- URL fields — format-validated (length + trim + non-empty) but not actually dereferenced.

---

## DTO reference

The full `UserProjectDto` definition lives in [`api/src/modules/user-projects/user-projects.service.ts`](../../../api/src/modules/user-projects/user-projects.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId` | Primary key + FK to `users`. |
| `projectTitle`, `projectCode` | Human-facing label + optional short code. `projectTitle` is required. |
| `projectType`, `projectStatus` | Enums — see the reference tables above. |
| `description`, `objectives`, `roleInProject`, `responsibilities` | Long-form narrative fields. |
| `teamSize`, `isSoloProject` | Team shape. Advisory — no cross-field enforcement. |
| `organizationName`, `clientName`, `industry` | Organizational context. |
| `technologiesUsed`, `toolsUsed`, `programmingLanguages`, `frameworks`, `databasesUsed`, `platform` | Free-form tech-stack strings. Kept as strings (not arrays) so a single row can join `"PostgreSQL, Redis"` without an extra table. |
| `startDate`, `endDate`, `isOngoing`, `durationMonths` | Timeline. See §8.11 for cross-field rules. |
| `keyAchievements`, `challengesFaced`, `lessonsLearned`, `impactSummary`, `usersServed` | Outcome narrative fields. |
| `projectUrl`, `repositoryUrl`, `demoUrl`, `documentationUrl`, `thumbnailUrl`, `caseStudyUrl` | Outbound link set. Format-validated; not dereferenced. |
| `isFeatured`, `isPublished` | Student-settable recognition / visibility flags. Not admin-gated. |
| `awards`, `certifications` | Long-form recognition text. |
| `referenceName`, `referenceEmail`, `referencePhone` | Optional reference contact. Email + phone are format-validated. |
| `displayOrder` | Sort hint for the user's own profile page. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary (first/last name, email, role, active/deleted). |

---

← [07 user-documents](07%20-%20user-documents.md) · **Next →** _TBD_
