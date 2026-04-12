# Phase 4 — User Skills

`user_skills` is a **1:M child of `users`** mapping each user to the skills they've picked up, along with how deep that skill goes (proficiency level, years of experience, optional certificate). Every row references the phase-02 `skills` master-data lookup via a NOT NULL FK, so you can never point at a skill that doesn't exist. A unique `(user_id, skill_id)` constraint means a user can have at most one row per skill — you don't list "JavaScript" twice.

Same **soft-delete + admin restore** model as `user_social_medias`, same `/me` + `/:id` split. If you've read [§4](04%20-%20user-social-medias.md) the shape will feel identical; the differences are the column set and the filter knobs.

All routes require auth. Permission codes use the **singular** resource name `user_skill`: `user_skill.create`, `user_skill.read`, `user_skill.read.own`, `user_skill.update`, `user_skill.update.own`, `user_skill.delete`, `user_skill.delete.own`, `user_skill.restore`.

> The table name is plural (`user_skills`) but the permission resource is singular (`user_skill`). The API path mirrors the table name: `/api/v1/user-skills`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [04 user-social-medias](04%20-%20user-social-medias.md) · **Next →** [06 user-languages](06%20-%20user-languages.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§5.1](#51-get-apiv1user-skills) | `GET` | `{{baseUrl}}/api/v1/user-skills` | `user_skill.read` | List all user-skill rows (admin+). |
| [§5.2](#52-get-apiv1user-skillsme) | `GET` | `{{baseUrl}}/api/v1/user-skills/me` | `user_skill.read.own` | List caller's own skill rows. |
| [§5.3](#53-post-apiv1user-skillsme) | `POST` | `{{baseUrl}}/api/v1/user-skills/me` | `user_skill.update.own` | Self-service create — `userId` derived from token. |
| [§5.4](#54-patch-apiv1user-skillsmeid) | `PATCH` | `{{baseUrl}}/api/v1/user-skills/me/:id` | `user_skill.update.own` (self match enforced) | Self-service partial update. |
| [§5.5](#55-delete-apiv1user-skillsmeid) | `DELETE` | `{{baseUrl}}/api/v1/user-skills/me/:id` | `user_skill.delete.own` (self match enforced) | Self-service soft-delete. |
| [§5.6](#56-get-apiv1user-skillsid) | `GET` | `{{baseUrl}}/api/v1/user-skills/:id` | `user_skill.read` *or* `user_skill.read.own` (+ self match) | Get one row by id. |
| [§5.7](#57-post-apiv1user-skills) | `POST` | `{{baseUrl}}/api/v1/user-skills` | `user_skill.create` | Admin create — targets any `userId`. |
| [§5.8](#58-patch-apiv1user-skillsid) | `PATCH` | `{{baseUrl}}/api/v1/user-skills/:id` | `user_skill.update` *or* `user_skill.update.own` (+ self match) | Admin or self partial update. |
| [§5.9](#59-delete-apiv1user-skillsid) | `DELETE` | `{{baseUrl}}/api/v1/user-skills/:id` | `user_skill.delete` *or* `user_skill.delete.own` (+ self match) | Admin or self soft-delete. |
| [§5.10](#510-post-apiv1user-skillsidrestore) | `POST` | `{{baseUrl}}/api/v1/user-skills/:id/restore` | `user_skill.restore` (admin+) | Un-soft-delete a hidden row. |

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete and restore. |
| Admin | Everything **except** the global `user_skill.delete` (admin still has `delete.own` and `restore`). |
| Instructor / Student | Self only — `read.own`, `update.own`, `delete.own`. No restore. |

### Proficiency level reference

The `proficiencyLevel` column is constrained to the values below — both the DB CHECK constraint and the zod schema reject anything else. Default is `beginner` when omitted on create.

| Value | Intended meaning |
|---|---|
| `beginner` | Just started; tutorial / intro level. |
| `intermediate` | Comfortable on day-to-day tasks; can ship unsupervised. |
| `advanced` | Deep working knowledge; mentors others on most topics. |
| `expert` | Recognised authority / public contributor / teacher. |

### Skill master-data reference

`skills` is phase-02 master data (seeded in `phase-02-master-data/skills`). The nested `skill` object in responses exposes `id`, `name`, `category`, `description`, and the master-data row's own `isActive` / `isDeleted` flags. `skillCategory` is a free-form text column on the master row (examples: `programming`, `design`, `data`, `soft-skill`).

---

## 5.1 `GET /api/v1/user-skills`

List user-skill rows. Backed by `udf_get_user_skills`, which joins `user_skills` → `users` → `skills`. Hides soft-deleted rows by default.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-skills` |
| Permission | `user_skill.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `skillId` | bigint | — | Filter by skill (FK to `skills`). |
| `proficiencyLevel` | enum | — | `beginner` / `intermediate` / `advanced` / `expert`. |
| `skillCategory` | string | — | Free-form match against `skills.category` (e.g. `programming`). |
| `isPrimary` | bool | — | Only rows the user flagged as their primary skill. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted rows (admin audit view). |
| `minExperience` | number | — | Only rows with `yearsOfExperience >= value`. |
| `userRole` | string | — | Parent user's role code. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across certificate URL, skill name / category / description, first/last name, email. |
| `sortTable` | enum | `uskill` | `uskill` / `skill` / `user`. |
| `sortColumn` | enum | `id` | See `user-skills.schemas.ts` for the full allowlist. |
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
      "skillId": 7,
      "proficiencyLevel": "advanced",
      "yearsOfExperience": 5,
      "isPrimary": true,
      "certificateUrl": "https://certs.example.com/priya-react.pdf",
      "endorsementCount": 14,
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
      "skill": {
        "id": 7,
        "name": "React",
        "category": "programming",
        "description": "Component-based UI library for JavaScript.",
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
  "message": "Missing required permission: user_skill.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-skills` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across skill name / description / user name / email | `?searchTerm=python` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=react` |
| Single user — all rows | `?userId=42` |
| Single user — primary skills | `?userId=42&isPrimary=true` |
| Filter by skill id | `?skillId=14` |
| Proficiency — beginner | `?proficiencyLevel=beginner` |
| Proficiency — intermediate | `?proficiencyLevel=intermediate` |
| Proficiency — advanced | `?proficiencyLevel=advanced` |
| Proficiency — expert | `?proficiencyLevel=expert` |
| Skill category — technical | `?skillCategory=technical` |
| Skill category — soft_skill | `?skillCategory=soft_skill` |
| Skill category — tool | `?skillCategory=tool` |
| Skill category — framework | `?skillCategory=framework` |
| Skill category — language | `?skillCategory=language` |
| Skill category — domain | `?skillCategory=domain` |
| Skill category — certification | `?skillCategory=certification` |
| Skill category — other | `?skillCategory=other` |
| Minimum experience — 1 year | `?minExperience=1` |
| Minimum experience — 3 years | `?minExperience=3` |
| Minimum experience — 5 years | `?minExperience=5` |
| Minimum experience — 10 years | `?minExperience=10` |
| Primary skills only | `?isPrimary=true` |
| Non-primary skills | `?isPrimary=false` |
| Active rows only | `?isActive=true` |
| Inactive rows only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by parent user role — student | `?userRole=student` |
| Filter by parent user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — uskill table — `id` DESC (default) | `?sortTable=uskill&sortColumn=id&sortDirection=DESC` |
| Sort — uskill table — `proficiency_level` DESC | `?sortTable=uskill&sortColumn=proficiency_level&sortDirection=DESC` |
| Sort — uskill table — `years_of_experience` DESC | `?sortTable=uskill&sortColumn=years_of_experience&sortDirection=DESC` |
| Sort — uskill table — `endorsement_count` DESC | `?sortTable=uskill&sortColumn=endorsement_count&sortDirection=DESC` |
| Sort — uskill table — `is_primary` DESC | `?sortTable=uskill&sortColumn=is_primary&sortDirection=DESC` |
| Sort — uskill table — `is_active` DESC | `?sortTable=uskill&sortColumn=is_active&sortDirection=DESC` |
| Sort — uskill table — `created_at` DESC | `?sortTable=uskill&sortColumn=created_at&sortDirection=DESC` |
| Sort — uskill table — `updated_at` DESC | `?sortTable=uskill&sortColumn=updated_at&sortDirection=DESC` |
| Sort — skill — `name` ASC | `?sortTable=skill&sortColumn=name&sortDirection=ASC` |
| Sort — skill — `category` ASC | `?sortTable=skill&sortColumn=category&sortDirection=ASC` |
| Sort — user — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — expert technical skills, most-endorsed | `?pageIndex=1&pageSize=20&proficiencyLevel=expert&skillCategory=technical&sortTable=uskill&sortColumn=endorsement_count&sortDirection=DESC` |
| Combo — 5+ years, primary only, newest first | `?pageIndex=1&pageSize=50&minExperience=5&isPrimary=true&sortTable=uskill&sortColumn=created_at&sortDirection=DESC` |
| Combo — search `python`, advanced+, alphabetic | `?pageIndex=1&pageSize=20&searchTerm=python&proficiencyLevel=advanced&sortTable=skill&sortColumn=name&sortDirection=ASC` |

> The `sortTable` param defaults to `uskill`. When sorting by a column that belongs to `skills` (`name`, `category`) or `users` (`first_name` / `last_name` / `email` / `role`), set `sortTable` to `skill` or `user`.

---

## 5.2 `GET /api/v1/user-skills/me`

List the caller's own skill rows. `userId` filter is forced server-side — any `userId` query param is ignored.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-skills/me` |
| Permission | `user_skill.read.own` |

### Responses

#### 200 OK

Same shape as §5.1. Empty `data` array when the caller has no rows yet.

---

## 5.3 `POST /api/v1/user-skills/me`

Self-service create. `userId` is derived from the token.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-skills/me` |
| Permission | `user_skill.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body**

```json
{
  "skillId": 7,
  "proficiencyLevel": "advanced",
  "yearsOfExperience": 5,
  "isPrimary": true,
  "certificateUrl": "https://certs.example.com/priya-react.pdf",
  "endorsementCount": 14
}
```

**Required:** `skillId`. `proficiencyLevel` (default `beginner`), `yearsOfExperience` (default `0`), `isPrimary` (default `false`), `certificateUrl`, `endorsementCount` (default `0`), `isActive` (default `true`) are optional.

> Only **one** row per `(userId, skillId)` pair — attempting to add a second row for the same skill fails with a unique-constraint `BAD_REQUEST`.
> `endorsementCount` is writable so admins can seed it during migrations, but it's not expected to be user-driven in practice.

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "User skill created",
  "data": { /* full UserSkillDto */ }
}
```

#### 400 Validation error — bad proficiency level

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": ["proficiencyLevel"],
      "message": "Invalid enum value. Expected 'beginner' | 'intermediate' | 'advanced' | 'expert', received 'superhuman'"
    }
  ]
}
```

#### 400 Validation error — negative years

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["yearsOfExperience"], "message": "yearsOfExperience must be >= 0" }
  ]
}
```

#### 400 Bad request — non-existent skill

```json
{
  "success": false,
  "message": "Error inserting user skill: Skill id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 5.4 `PATCH /api/v1/user-skills/me/:id`

Self-service partial update.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-skills/me/:id` |
| Permission | `user_skill.update.own` |

**Request body** — any subset of the create fields. Example:

```json
{
  "proficiencyLevel": "expert",
  "yearsOfExperience": 7,
  "isPrimary": false
}
```

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User skill updated",
  "data": { /* full UserSkillDto */ }
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
  "message": "You can only edit your own skills.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User skill 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 5.5 `DELETE /api/v1/user-skills/me/:id`

Self-service soft-delete. The row is marked `is_deleted=TRUE, is_active=FALSE` and hidden from the default GET. Hard-delete is not exposed.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-skills/me/:id` |
| Permission | `user_skill.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User skill deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only delete your own skills.",
  "code": "FORBIDDEN"
}
```

> No self-restore — see §5.10 for the admin restore path.

---

## 5.6 `GET /api/v1/user-skills/:id`

Get one row by id. `authorizeSelfOr` pattern — admins read any row, self reads own row.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-skills/:id` |
| Permission | `user_skill.read` *or* `user_skill.read.own` |

### Responses

#### 200 OK

Single `UserSkillDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_skill.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, or is soft-deleted.

---

## 5.7 `POST /api/v1/user-skills`

Admin create — body requires `userId` explicitly.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-skills` |
| Permission | `user_skill.create` |

**Request body**

```json
{
  "userId": 42,
  "skillId": 7,
  "proficiencyLevel": "advanced",
  "yearsOfExperience": 5,
  "isPrimary": true,
  "certificateUrl": "https://certs.example.com/priya-react.pdf",
  "endorsementCount": 14
}
```

### Responses

#### 201 Created

Same shape as §5.3.

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user skill: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — parent user inactive (activating row)

```json
{
  "success": false,
  "message": "Error inserting user skill: Cannot create active user skill: user id 42 is inactive.",
  "code": "BAD_REQUEST"
}
```

---

## 5.8 `PATCH /api/v1/user-skills/:id`

`authorizeSelfOr` — admins edit any row, self edits own row.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-skills/:id` |
| Permission | `user_skill.update` *or* `user_skill.update.own` |

### Responses

#### 200 OK

Full updated `UserSkillDto`.

#### 403 Forbidden — own-scope on a foreign row

Same shape as §5.6.

#### 400 Bad request — soft-deleted row

```json
{
  "success": false,
  "message": "Error updating user skill: No active user skill found with id 42.",
  "code": "BAD_REQUEST"
}
```

> The update UDF refuses to touch a soft-deleted row — restore it first via §5.10.

---

## 5.9 `DELETE /api/v1/user-skills/:id`

Admin or self soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-skills/:id` |
| Permission | `user_skill.delete` *or* `user_skill.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User skill deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — already deleted / unknown id

```json
{
  "success": false,
  "message": "Error deleting user skill: No active user skill found to delete with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 5.10 `POST /api/v1/user-skills/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. The route uses `getByIdIncludingDeleted` to surface a clean `404` / `400` before the UDF runs.

The UDF validates both parents: the owning `users` row AND the referenced `skills` master row must still be active / not deleted. If the skill itself has been retired, update the row to reference a live skill first.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-skills/:id/restore` |
| Permission | `user_skill.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User skill restored",
  "data": { /* full UserSkillDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "User skill 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user skill: Cannot restore user skill 42: owning user 9 is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — skill master row is deleted

```json
{
  "success": false,
  "message": "Error restoring user skill: Cannot restore user skill 42: skill 7 is deleted. Update the row first.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_skill.restore`

```json
{
  "success": false,
  "message": "Missing required permission: user_skill.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User skill 42 not found",
  "code": "NOT_FOUND"
}
```

---

## DTO reference

The full `UserSkillDto` definition lives in [`api/src/modules/user-skills/user-skills.service.ts`](../../../api/src/modules/user-skills/user-skills.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId`, `skillId` | Primary key + FKs (both NOT NULL). `(userId, skillId)` is unique. |
| `proficiencyLevel` | One of `beginner` / `intermediate` / `advanced` / `expert`. |
| `yearsOfExperience` | NUMERIC, non-negative. Up to 99. |
| `isPrimary` | User's "main" / headline skill. Only one per user is conventional but not enforced by DB. |
| `certificateUrl` | Optional public link to a certificate / proof. |
| `endorsementCount` | Integer >= 0. Admin-seeded; not a user-driven number. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary (first/last name, email, role, active/deleted). |
| `skill` | Nested `skills` lookup — `name`, `category`, `description`, plus master-data active/deleted flags. |

← [04 user-social-medias](04%20-%20user-social-medias.md) · **Next →** [06 user-languages](06%20-%20user-languages.md)
