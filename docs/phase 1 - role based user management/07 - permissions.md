# Phase 1 — Permissions

RBAC permission catalog. All routes require auth. Permission codes: `permission.read`, `permission.create`, `permission.update`, `permission.delete`, `permission.restore`.

← [06 roles](06%20-%20roles.md) · **Next →** [08 role-permissions](08%20-%20role-permissions.md)

---

## 7.1 `GET /api/v1/permissions`

List permissions.

**Query params**

| Param | Notes |
|---|---|
| `pageIndex`, `pageSize`, `searchTerm` | Standard. |
| `isActive`, `isDeleted` | bool. |
| `resource` | Lowercase identifier (e.g. `course`). |
| `action` | Lowercase identifier (e.g. `read`, `create`, `update`, `delete`). |
| `scope` | Lowercase identifier (e.g. `global`, `own`). |
| `code` | Slug-style code. |
| `sortColumn` | `id`, `display_order` (default), `name`, `code`, `resource`, `action`, `scope`, `is_active`, `created_at`, `updated_at`. |
| `sortDirection` | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 17,
  "name": "Read courses",
  "code": "course.read",
  "resource": "course",
  "action": "read",
  "scope": "global",
  "description": "View any course in the catalog",
  "displayOrder": 10,
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Defaults — what you get if you omit everything

`GET /api/v1/permissions` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=display_order  sortDirection=ASC
isActive=∅   isDeleted=∅   resource=∅   action=∅   scope=∅   code=∅
```

The default `display_order` sort matches the order admins curated for the permission picker UI.

### Sample queries & responses

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (omitted for brevity).

**1. Pagination — page 1, 5 rows**

```bash
curl "http://localhost:3000/api/v1/permissions?pageIndex=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [
    { "id": 1, "name": "Read users",       "code": "user.read",        "resource": "user",        "action": "read",   "scope": "global", "...": "..." },
    { "id": 2, "name": "Create users",     "code": "user.create",      "resource": "user",        "action": "create", "scope": "global", "...": "..." },
    { "id": 3, "name": "Update users",     "code": "user.update",      "resource": "user",        "action": "update", "scope": "global", "...": "..." },
    { "id": 4, "name": "Delete users",     "code": "user.delete",      "resource": "user",        "action": "delete", "scope": "global", "...": "..." },
    { "id": 5, "name": "Read countries",   "code": "country.read",     "resource": "country",     "action": "read",   "scope": "global", "...": "..." }
  ],
  "meta": { "page": 1, "limit": 5, "totalCount": 42, "totalPages": 9 }
}
```

**2. Pagination — page 2, 5 rows**

```bash
curl "http://localhost:3000/api/v1/permissions?pageIndex=2&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`meta.page` becomes `2` and you get rows 6–10. The shape is identical.

**3. Filter — status flags**

```bash
curl "http://localhost:3000/api/v1/permissions?isActive=true"  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/permissions?isDeleted=true" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Boolean params accept `true|false|1|0|yes|no`. `isDeleted=true` is the only way to surface soft-deleted rows.

**4. Filter — by `resource`**

```bash
curl "http://localhost:3000/api/v1/permissions?resource=course" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`resource` is a lowercase identifier (matched against the lowercased column server-side). Returns every permission whose subject is `course`.

**5. Filter — by `action`**

```bash
curl "http://localhost:3000/api/v1/permissions?action=read" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Common values: `read`, `create`, `update`, `delete`, `restore`, `assign`, `publish`. Anything that satisfies the lowercase-identifier regex is accepted.

**6. Filter — by `scope`**

```bash
curl "http://localhost:3000/api/v1/permissions?scope=global" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Common values: `global`, `own`. The default scope on create is `global`.

**7. Filter — by exact `code`**

```bash
curl "http://localhost:3000/api/v1/permissions?code=course.read" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Equality match against the slug-style code. (Not a search — use `searchTerm` for partial matches.)

**8. Free-text search**

```bash
curl "http://localhost:3000/api/v1/permissions?searchTerm=course" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`searchTerm` runs an `ILIKE` against `name`, `code`, and `description` inside `udf_get_permissions`. Matches `course.read`, `course.create`, and `Publish courses`.

**9. Sorting — by `code` ascending**

```bash
curl "http://localhost:3000/api/v1/permissions?sortColumn=code&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`sortColumn` is whitelisted (see the table above). `sortColumn=foo` returns `400 VALIDATION_ERROR`.

**10. Combined filters — every active `course.*` permission in scope `global`, sorted by display order**

```bash
curl "http://localhost:3000/api/v1/permissions?isActive=true&resource=course&scope=global&sortColumn=display_order&sortDirection=ASC&pageSize=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

All filters compose with `AND`.

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
  "meta": { "page": 999, "limit": 20, "totalCount": 42, "totalPages": 3 }
}
```

### Possible error responses

**400 — invalid `resource` (uppercase rejected)**

```bash
curl "http://localhost:3000/api/v1/permissions?resource=COURSE" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "resource", "message": "must be lowercase alphanumerics or underscore", "code": "invalid_string" }
  ]
}
```

The same envelope shape (with a different `path` / `message`) is returned for any other bad input — `pageSize=500`, `code=Has Spaces`, `isActive=maybe`, an unknown `sortColumn`, etc. The full set of rules lives in `listPermissionsQuerySchema` (`api/src/modules/resources/permissions.schemas.ts`).

**401 — missing or expired bearer token**

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

**403 — caller is authenticated but lacks `permission.read`**

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

**500** — see the global catalog in [00 — overview](00%20-%20overview.md#3-error-catalog).

---

## 7.2 `GET /api/v1/permissions/:id`

Read a single permission by id. Permission: `permission.read`.

**Sample request**

```bash
curl "http://localhost:3000/api/v1/permissions/17" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 17,
    "name": "Read courses",
    "code": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "description": "View any course in the catalog",
    "displayOrder": 10,
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
**403** — caller lacks `permission.read`.

**404 — no permission with that id**

```json
{ "success": false, "message": "Permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 7.3 `POST /api/v1/permissions`

Create a permission. Permission: `permission.create`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/permissions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published",
    "displayOrder": 30,
    "isActive": true
  }'
```

`name`, `code`, `resource`, and `action` are required. `scope` defaults to `global`. `resource`, `action`, and `scope` must all be lowercase identifiers (`[a-z0-9_]+`).

**Response 201** — full new row.

```json
{
  "success": true,
  "message": "Permission created",
  "data": {
    "id": 43,
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published",
    "displayOrder": 30,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T14:25:11.802Z",
    "updatedAt": "2026-04-10T14:25:11.802Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — uppercase resource (must be lowercase)**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "resource", "message": "must be lowercase alphanumerics or underscore", "code": "invalid_string" }
  ]
}
```

**400 — bad code slug**

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

**401** — missing or expired bearer token.
**403** — caller lacks `permission.create`.

**409 — duplicate code**

```json
{
  "success": false,
  "message": "Permission with code=course.publish already exists",
  "code": "DUPLICATE_ENTRY"
}
```

The full set of body rules lives in `createPermissionBodySchema` (`api/src/modules/resources/permissions.schemas.ts`).

---

## 7.4 `PATCH /api/v1/permissions/:id`

Partial update — supply any subset of fields, but at least one. Permission: `permission.update`. Same field allowlist and lowercase rules as the create body.

**Sample request**

```bash
curl -X PATCH "http://localhost:3000/api/v1/permissions/43" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Move a course from draft to published, including curriculum review",
    "displayOrder": 35
  }'
```

**Response 200** — full updated row.

```json
{
  "success": true,
  "message": "Permission updated",
  "data": {
    "id": 43,
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published, including curriculum review",
    "displayOrder": 35,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T14:25:11.802Z",
    "updatedAt": "2026-04-10T14:48:33.910Z",
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
**403** — caller lacks `permission.update`.
**404** — no permission with that id.
**409** — another permission already uses the new `code`.

---

## 7.5 `DELETE /api/v1/permissions/:id`

Soft delete. Sets `is_deleted = TRUE` on the row. Permission: `permission.delete`.

**Sample request**

```bash
curl -X DELETE "http://localhost:3000/api/v1/permissions/43" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "Permission deleted",
  "data": { "id": 43, "deleted": true }
}
```

**Possible error responses**

**400** — non-numeric id (`VALIDATION_ERROR` envelope, `path: "id"`).
**401** — missing or expired bearer token.
**403** — caller lacks `permission.delete`.

**404 — no permission with that id**

```json
{ "success": false, "message": "Permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 7.6 `POST /api/v1/permissions/:id/restore`

Reverse a soft delete. Permission: `permission.restore`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/permissions/43/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — full restored row.

```json
{
  "success": true,
  "message": "Permission restored",
  "data": {
    "id": 43,
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published, including curriculum review",
    "displayOrder": 35,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T14:25:11.802Z",
    "updatedAt": "2026-04-10T15:02:48.118Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — row was never deleted**

```json
{
  "success": false,
  "message": "Permission 43 is not deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `permission.restore`.
**404** — no permission with that id.

---

**Errors common to all permission routes**

| HTTP | code | Cause |
|---|---|---|
| 403 | `FORBIDDEN` | Missing permission. |
| 404 | `NOT_FOUND` | Unknown id. |
| 409 | `DUPLICATE_ENTRY` | Another permission already uses the same `code`. |
