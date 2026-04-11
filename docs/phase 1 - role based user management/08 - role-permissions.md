# Phase 1 — Role Permissions (junction)

Bind permissions to roles. All routes require auth. Permission codes: `permission.read` for reads, `permission.assign` for writes.

← [07 permissions](07%20-%20permissions.md) · **Next →** [09 user-permissions](09%20-%20user-permissions.md)

---

## 8.1 `GET /api/v1/role-permissions`

List role↔permission bindings.

**Query params**

| Param | Notes |
|---|---|
| `pageIndex`, `pageSize`, `searchTerm` | Standard. |
| `roleId`, `roleCode` | Filter by role. |
| `permissionId` | Filter by permission. |
| `resource`, `action`, `scope` | Lowercase identifiers. |
| `isActive`, `isDeleted` | bool. |
| `sortColumn` | `id`, `role_id`, `role_name`, `role_level` (default), `perm_name`, `perm_code`, `resource`, `created_at`. |
| `sortDirection` | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 312,
  "roleId": 4,
  "roleName": "Student",
  "roleLevel": 90,
  "permissionId": 17,
  "permName": "Read courses",
  "permCode": "course.read",
  "resource": "course",
  "action": "read",
  "scope": "global",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Defaults — what you get if you omit everything

`GET /api/v1/role-permissions` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=role_level  sortDirection=ASC
roleId=∅     roleCode=∅    permissionId=∅
resource=∅   action=∅      scope=∅
isActive=∅   isDeleted=∅
```

The default `role_level` sort means super-admin assignments come first, then admin, instructor, student — handy for the role-matrix UI.

### Sample queries & responses

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (omitted for brevity).

**1. Pagination — page 1, 5 rows**

```bash
curl "http://localhost:3000/api/v1/role-permissions?pageIndex=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [
    { "id": 1, "roleId": 1, "roleName": "Super Admin", "roleLevel": 0,  "permCode": "user.read",     "resource": "user",     "action": "read",   "...": "..." },
    { "id": 2, "roleId": 1, "roleName": "Super Admin", "roleLevel": 0,  "permCode": "user.create",   "resource": "user",     "action": "create", "...": "..." },
    { "id": 3, "roleId": 1, "roleName": "Super Admin", "roleLevel": 0,  "permCode": "user.update",   "resource": "user",     "action": "update", "...": "..." },
    { "id": 4, "roleId": 1, "roleName": "Super Admin", "roleLevel": 0,  "permCode": "user.delete",   "resource": "user",     "action": "delete", "...": "..." },
    { "id": 5, "roleId": 1, "roleName": "Super Admin", "roleLevel": 0,  "permCode": "country.read",  "resource": "country",  "action": "read",   "...": "..." }
  ],
  "meta": { "page": 1, "limit": 5, "totalCount": 168, "totalPages": 34 }
}
```

**2. Pagination — page 2, 5 rows**

```bash
curl "http://localhost:3000/api/v1/role-permissions?pageIndex=2&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`meta.page` becomes `2` and you get rows 6–10. The shape is identical.

**3. Filter — by role**

```bash
curl "http://localhost:3000/api/v1/role-permissions?roleId=4"            -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/role-permissions?roleCode=student"    -H "Authorization: Bearer $ACCESS_TOKEN"
```

`roleId` and `roleCode` are interchangeable lookups for the same row; use whichever the caller already has on hand.

**4. Filter — by permission**

```bash
curl "http://localhost:3000/api/v1/role-permissions?permissionId=17" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns every role that has been granted permission `17`. Useful for "who can read courses?" audits.

**5. Filter — by `resource`**

```bash
curl "http://localhost:3000/api/v1/role-permissions?resource=course" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`resource` is a lowercase identifier matched against the joined permission row.

**6. Filter — by `action`**

```bash
curl "http://localhost:3000/api/v1/role-permissions?action=delete" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Lets you answer "which roles can `delete` anything?" in one query.

**7. Filter — by `scope`**

```bash
curl "http://localhost:3000/api/v1/role-permissions?scope=own" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Common scopes: `global`, `own`.

**8. Filter — status flags**

```bash
curl "http://localhost:3000/api/v1/role-permissions?isActive=true"  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/role-permissions?isDeleted=true" -H "Authorization: Bearer $ACCESS_TOKEN"
```

`isDeleted=true` is the only way to surface bindings that were soft-revoked.

**9. Free-text search**

```bash
curl "http://localhost:3000/api/v1/role-permissions?searchTerm=course" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`searchTerm` runs an `ILIKE` against `role_name`, `perm_name`, and `perm_code` inside `udf_get_role_permissions`.

**10. Sorting — by `perm_code` ascending**

```bash
curl "http://localhost:3000/api/v1/role-permissions?sortColumn=perm_code&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`sortColumn` is whitelisted to: `id`, `role_id`, `role_name`, `role_level` (default), `perm_name`, `perm_code`, `resource`, `created_at`. Anything else returns `400 VALIDATION_ERROR`.

**11. Combined filters — every active `student`-role grant on `course.*`, sorted by perm code**

```bash
curl "http://localhost:3000/api/v1/role-permissions?roleCode=student&resource=course&isActive=true&sortColumn=perm_code&sortDirection=ASC&pageSize=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

All filters compose with `AND`.

**12. Empty result**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

**13. Page out of range**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 999, "limit": 20, "totalCount": 168, "totalPages": 9 }
}
```

### Possible error responses

**400 — invalid `roleId` (must be a positive integer)**

```bash
curl "http://localhost:3000/api/v1/role-permissions?roleId=-3" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "roleId", "message": "must be positive", "code": "too_small" }
  ]
}
```

The same envelope shape (with a different `path` / `message`) is returned for any other bad input — `pageSize=500`, `resource=COURSE` (must be lowercase), `roleCode=Has Spaces`, an unknown `sortColumn`, etc. The full set of rules lives in `listRolePermissionsQuerySchema` (`api/src/modules/junctions/role-permissions.schemas.ts`).

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

## 8.2 `GET /api/v1/role-permissions/:id`

Read one binding by junction id. Permission: `permission.read`.

**Sample request**

```bash
curl "http://localhost:3000/api/v1/role-permissions/312" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 312,
    "roleId": 4,
    "roleName": "Student",
    "roleLevel": 90,
    "permissionId": 17,
    "permName": "Read courses",
    "permCode": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400** — non-numeric id (`VALIDATION_ERROR` envelope, `path: "id"`).
**401** — missing or expired bearer token.
**403** — caller lacks `permission.read`.

**404 — no role-permission row with that id**

```json
{ "success": false, "message": "Role-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 8.3 `POST /api/v1/role-permissions`

Assign a permission to a role. Permission: `permission.assign`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/role-permissions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "roleId": 4, "permissionId": 17 }'
```

Both `roleId` and `permissionId` are required positive integers.

**Response 201** — full junction row.

```json
{
  "success": true,
  "message": "Role-permission assigned",
  "data": {
    "id": 312,
    "roleId": 4,
    "roleName": "Student",
    "roleLevel": 90,
    "permissionId": 17,
    "permName": "Read courses",
    "permCode": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T15:30:42.115Z",
    "updatedAt": "2026-04-10T15:30:42.115Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — missing field**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "permissionId", "message": "Required", "code": "invalid_type" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`.

**404 — referenced role or permission does not exist**

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

**409 — duplicate binding**

```json
{
  "success": false,
  "message": "Role 4 already has permission 17",
  "code": "DUPLICATE_ENTRY"
}
```

The full set of body rules lives in `assignRolePermissionBodySchema` (`api/src/modules/junctions/role-permissions.schemas.ts`).

---

## 8.4 `POST /api/v1/role-permissions/revoke`

Revoke by `(roleId, permissionId)` pair instead of junction id — handy when the caller doesn't know the row id. Permission: `permission.assign`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/role-permissions/revoke" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "roleId": 4, "permissionId": 17 }'
```

**Response 200**

```json
{
  "success": true,
  "message": "Role-permission assignment revoked",
  "data": { "roleId": 4, "permissionId": 17, "revoked": true }
}
```

**Possible error responses**

**400** — missing/invalid `roleId` or `permissionId` (`VALIDATION_ERROR` envelope).
**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`.

**404 — that role does not have that permission**

```json
{ "success": false, "message": "Role 4 does not have permission 17", "code": "NOT_FOUND" }
```

---

## 8.5 `DELETE /api/v1/role-permissions/:id`

Soft delete the binding by junction id. Sets `is_deleted = TRUE` on the row. Permission: `permission.assign`.

**Sample request**

```bash
curl -X DELETE "http://localhost:3000/api/v1/role-permissions/312" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "Role-permission deleted",
  "data": { "id": 312, "deleted": true }
}
```

**Possible error responses**

**400** — non-numeric id (`VALIDATION_ERROR` envelope, `path: "id"`).
**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`.

**404 — no role-permission row with that id**

```json
{ "success": false, "message": "Role-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 8.6 `POST /api/v1/role-permissions/:id/restore`

Reverse a soft delete by junction id. Permission: `permission.assign`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/role-permissions/312/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — full restored junction row.

```json
{
  "success": true,
  "message": "Role-permission restored",
  "data": {
    "id": 312,
    "roleId": 4,
    "roleName": "Student",
    "roleLevel": 90,
    "permissionId": 17,
    "permName": "Read courses",
    "permCode": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T15:30:42.115Z",
    "updatedAt": "2026-04-10T15:55:09.221Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — row was never deleted**

```json
{
  "success": false,
  "message": "Role-permission 312 is not deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`.
**404** — no role-permission row with that id.
