# Phase 1 — Roles

RBAC role catalog. All routes require auth. Permission codes: `role.read`, `role.create`, `role.update`, `role.delete`, `role.restore`.

> **System roles** (`super_admin`, `admin`, `instructor`, `student`) are protected by the database — they cannot be deleted, even by a super-admin. Attempts return **400 BAD_REQUEST**.

← [05 countries](05%20-%20countries.md) · **Next →** [07 permissions](07%20-%20permissions.md)

---

## 6.1 `GET /api/v1/roles`

List roles.

**Query params**

| Param | Notes |
|---|---|
| `pageIndex`, `pageSize`, `searchTerm` | Standard. |
| `isActive` | bool. |
| `level` | int 0–99. |
| `parentRoleId` | int. |
| `isSystemRole` | bool. |
| `code` | Slug-style code. |
| `sortColumn` | `display_order` (default), `name`, `code`, `level`, `created_at`. |
| `sortDirection` | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 4,
  "name": "Student",
  "code": "student",
  "description": "Default end-user role",
  "parentRoleId": null,
  "level": 90,
  "isSystemRole": true,
  "displayOrder": 40,
  "icon": "graduation-cap",
  "color": "#3b82f6",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

### Defaults — what you get if you omit everything

`GET /api/v1/roles` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=display_order  sortDirection=ASC
isActive=∅   level=∅   parentRoleId=∅   isSystemRole=∅   code=∅
```

The `display_order` default sort is what makes the role-picker UI show roles in the curated order rather than alphabetically.

### Sample queries & responses

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (omitted for brevity).

**1. Pagination — page 1, 5 rows**

```bash
curl "http://localhost:3000/api/v1/roles?pageIndex=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [
    { "id": 1, "name": "Super Admin", "code": "super_admin", "level": 0,  "displayOrder": 10, "...": "..." },
    { "id": 2, "name": "Admin",       "code": "admin",       "level": 10, "displayOrder": 20, "...": "..." },
    { "id": 3, "name": "Instructor",  "code": "instructor",  "level": 50, "displayOrder": 30, "...": "..." },
    { "id": 4, "name": "Student",     "code": "student",     "level": 90, "displayOrder": 40, "...": "..." }
  ],
  "meta": { "page": 1, "limit": 5, "totalCount": 4, "totalPages": 1 }
}
```

**2. Pagination — page 2** (only one page exists by default; useful to demonstrate the empty-page envelope)

```bash
curl "http://localhost:3000/api/v1/roles?pageIndex=2&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns `data: []` with `meta.page: 2`.

**3. Filter — only active roles**

```bash
curl "http://localhost:3000/api/v1/roles?isActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Boolean params accept `true|false|1|0|yes|no`.

**4. Filter — by exact level**

```bash
curl "http://localhost:3000/api/v1/roles?level=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns every role at exactly level 50. (There is no `levelLte` / `levelGte` — the schema only exposes equality.)

**5. Filter — children of a parent role**

```bash
curl "http://localhost:3000/api/v1/roles?parentRoleId=2" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns every role whose `parentRoleId` is `2`.

**6. Filter — system vs custom roles**

```bash
curl "http://localhost:3000/api/v1/roles?isSystemRole=true"  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/roles?isSystemRole=false" -H "Authorization: Bearer $ACCESS_TOKEN"
```

System roles (`super_admin`, `admin`, `instructor`, `student`) cannot be deleted; the `false` variant lets the admin UI list only the custom roles that *can* be edited.

**7. Filter — by exact code**

```bash
curl "http://localhost:3000/api/v1/roles?code=instructor" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`code` is the slug-style identifier; this is an equality match, not a search.

**8. Free-text search**

```bash
curl "http://localhost:3000/api/v1/roles?searchTerm=admin" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`searchTerm` runs an `ILIKE` against `name` and `code` inside `udf_get_roles`. Both `Admin` and `Super Admin` match.

**9. Sorting — alphabetic by name**

```bash
curl "http://localhost:3000/api/v1/roles?sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`sortColumn` is whitelisted to: `display_order` (default), `name`, `code`, `level`, `created_at`. Anything else returns `400 VALIDATION_ERROR`.

**10. Combined filters — active custom roles at level ≤ instructor, sorted by level**

```bash
curl "http://localhost:3000/api/v1/roles?isActive=true&isSystemRole=false&sortColumn=level&sortDirection=ASC&pageSize=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

(There is no `levelLte` filter, so the "≤ instructor" framing here is enforced by sorting the small custom-role catalog rather than by filter.)

**11. Empty result**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

**12. Page out of range**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 999, "limit": 20, "totalCount": 4, "totalPages": 1 }
}
```

### Possible error responses

**400 — invalid `level`**

```bash
curl "http://localhost:3000/api/v1/roles?level=150" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "level", "message": "Number must be less than or equal to 99", "code": "too_big" }
  ]
}
```

The same envelope shape (with a different `path` / `message`) is returned for any other bad input — `pageSize=500`, `code=Has Spaces` (must be slug-style), `isSystemRole=maybe`, an unknown `sortColumn`, etc. The full set of rules lives in `listRolesQuerySchema` (`api/src/modules/resources/roles.schemas.ts`).

**401 — missing or expired bearer token**

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

**403 — caller is authenticated but lacks `role.read`**

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

**500** — see the global catalog in [00 — overview](00%20-%20overview.md#3-error-catalog).

---

## 6.2 `GET /api/v1/roles/:id`

Read a single role by id. Permission: `role.read`.

**Sample request**

```bash
curl "http://localhost:3000/api/v1/roles/4" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 4,
    "name": "Student",
    "code": "student",
    "description": "Default end-user role",
    "parentRoleId": null,
    "level": 90,
    "isSystemRole": true,
    "displayOrder": 40,
    "icon": "graduation-cap",
    "color": "#3b82f6",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — id not a positive integer**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "id", "message": "must be positive", "code": "too_small" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `role.read`.

**404 — no role with that id**

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

---

## 6.3 `POST /api/v1/roles`

Create a custom role. Permission: `role.create`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/roles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Course Author",
    "code": "course_author",
    "description": "Can author and publish courses",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 25,
    "icon": "pen",
    "color": "#10b981",
    "isActive": true
  }'
```

Only `name` and `code` are strictly required; everything else has sensible defaults (`level` defaults to `99`, `displayOrder` to `0`, `isActive` to `true`).

**Response 201** — full new row.

```json
{
  "success": true,
  "message": "Role created",
  "data": {
    "id": 12,
    "name": "Course Author",
    "code": "course_author",
    "description": "Can author and publish courses",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 25,
    "icon": "pen",
    "color": "#10b981",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T13:14:55.221Z",
    "updatedAt": "2026-04-10T13:14:55.221Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — invalid `code` (slug rules)**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "code", "message": "code must be lowercase alphanumerics, dot or underscore", "code": "invalid_string" }
  ]
}
```

**400 — bad hex color**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "color", "message": "color must be a hex code (#fff or #ffffff)", "code": "invalid_string" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `role.create`, or attempted to create a role at a level the caller doesn't outrank.

**409 — duplicate code**

```json
{
  "success": false,
  "message": "Role with code=course_author already exists",
  "code": "DUPLICATE_ENTRY"
}
```

The full set of body rules lives in `createRoleBodySchema` (`api/src/modules/resources/roles.schemas.ts`).

---

## 6.4 `PATCH /api/v1/roles/:id`

Partial update — supply any subset of fields, but at least one. Permission: `role.update`. The same rules from 6.3 apply (slug code, hex colour, level 0–99, etc.).

**Sample request**

```bash
curl -X PATCH "http://localhost:3000/api/v1/roles/12" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Authors and publishes courses, manages enrolments",
    "displayOrder": 30,
    "color": "#16a34a"
  }'
```

**Response 200** — full updated row.

```json
{
  "success": true,
  "message": "Role updated",
  "data": {
    "id": 12,
    "name": "Course Author",
    "code": "course_author",
    "description": "Authors and publishes courses, manages enrolments",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 30,
    "icon": "pen",
    "color": "#16a34a",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T13:14:55.221Z",
    "updatedAt": "2026-04-10T13:42:08.117Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — empty body**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "", "message": "Provide at least one field to update", "code": "custom" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `role.update`, or attempted to raise a role's level above their own rank.
**404** — no role with that id.
**409** — another role already uses the new `code`.

---

## 6.5 `DELETE /api/v1/roles/:id`

Soft delete. Sets `is_deleted = TRUE` on the row. **Blocked at the DB layer if the role's `isSystemRole = true`** — the four shipped roles (`super_admin`, `admin`, `instructor`, `student`) cannot be deleted by anyone, including super-admins. Permission: `role.delete`.

**Sample request**

```bash
curl -X DELETE "http://localhost:3000/api/v1/roles/12" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "Role deleted",
  "data": { "id": 12, "deleted": true }
}
```

**Possible error responses**

**400 — tried to delete a system role**

```json
{
  "success": false,
  "message": "System roles cannot be deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `role.delete`.
**404** — no role with that id.

---

## 6.6 `POST /api/v1/roles/:id/restore`

Reverse a soft delete. Permission: `role.restore`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/roles/12/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — full restored row.

```json
{
  "success": true,
  "message": "Role restored",
  "data": {
    "id": 12,
    "name": "Course Author",
    "code": "course_author",
    "description": "Authors and publishes courses, manages enrolments",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 30,
    "icon": "pen",
    "color": "#16a34a",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T13:14:55.221Z",
    "updatedAt": "2026-04-10T14:01:37.224Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — row was never deleted**

```json
{
  "success": false,
  "message": "Role 12 is not deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `role.restore`.
**404** — no role with that id.

---

**Errors common to all role routes**

| HTTP | code | Cause |
|---|---|---|
| 400 | `BAD_REQUEST` | Tried to delete a system role. |
| 403 | `FORBIDDEN` | Missing permission. |
| 404 | `NOT_FOUND` | Unknown id. |
| 409 | `DUPLICATE_ENTRY` | Another role already uses the same `code`. |
