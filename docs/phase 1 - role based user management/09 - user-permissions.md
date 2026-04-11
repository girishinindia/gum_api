# Phase 1 — User Permissions (junction)

User-level overrides on top of the role-based defaults. A user can be **granted** an extra permission their role doesn't carry, or **denied** a permission their role does carry.

All routes require auth. Permission codes: `permission.read` for reads, `permission.assign` for writes.

← [08 role-permissions](08%20-%20role-permissions.md) · **Next →** [10 walkthrough and index](10%20-%20walkthrough%20and%20index.md)

---

## 9.1 `GET /api/v1/user-permissions`

List user-level overrides.

**Query params**

| Param | Notes |
|---|---|
| `pageIndex`, `pageSize`, `searchTerm` | Standard. |
| `userId` | Filter to one user. |
| `permissionId` | Filter to one permission. |
| `grantType` | `grant` or `deny`. |
| `resource`, `action`, `scope` | Lowercase identifiers. |
| `isActive`, `isDeleted` | bool. |
| `sortColumn` | `id` (default), `user_id`, `user_name`, `perm_name`, `perm_code`, `resource`, `grant_type`, `created_at`. |
| `sortDirection` | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 91,
  "userId": 42,
  "userName": "Asha Patel",
  "permissionId": 28,
  "permName": "Publish courses",
  "permCode": "course.publish",
  "resource": "course",
  "action": "publish",
  "scope": "global",
  "grantType": "grant",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-04-08T13:00:00.000Z"
}
```

### Defaults — what you get if you omit everything

`GET /api/v1/user-permissions` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
userId=∅     permissionId=∅   grantType=∅
resource=∅   action=∅          scope=∅
isActive=∅   isDeleted=∅
```

The default `id` sort is the simplest deterministic order; switch to `created_at DESC` when you want the newest overrides first.

### Sample queries & responses

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (omitted for brevity).

**1. Pagination — page 1, 5 rows**

```bash
curl "http://localhost:3000/api/v1/user-permissions?pageIndex=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [
    { "id": 1, "userId": 42, "userName": "Asha Patel", "permCode": "course.publish", "grantType": "grant", "...": "..." },
    { "id": 2, "userId": 43, "userName": "Ravi Kumar", "permCode": "course.delete",  "grantType": "deny",  "...": "..." },
    { "id": 3, "userId": 44, "userName": "Maya Singh", "permCode": "user.update",    "grantType": "grant", "...": "..." },
    { "id": 4, "userId": 45, "userName": "Karan Shah", "permCode": "course.read",    "grantType": "deny",  "...": "..." },
    { "id": 5, "userId": 46, "userName": "Pooja Rao",  "permCode": "course.publish", "grantType": "grant", "...": "..." }
  ],
  "meta": { "page": 1, "limit": 5, "totalCount": 23, "totalPages": 5 }
}
```

**2. Pagination — page 2, 5 rows**

```bash
curl "http://localhost:3000/api/v1/user-permissions?pageIndex=2&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`meta.page` becomes `2` and you get rows 6–10. The shape is identical.

**3. Filter — by user**

```bash
curl "http://localhost:3000/api/v1/user-permissions?userId=42" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns every override (grant **and** deny) attached to user `42`. The fastest way to answer "what extra permissions does this user have?".

**4. Filter — by permission**

```bash
curl "http://localhost:3000/api/v1/user-permissions?permissionId=28" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns every user whose entry references permission `28`. Useful for "who has been individually granted course-publish?" audits.

**5. Filter — by `grantType`**

```bash
curl "http://localhost:3000/api/v1/user-permissions?grantType=grant" -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/user-permissions?grantType=deny"  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`grantType` is the enum `grant | deny`. Anything else returns `400 VALIDATION_ERROR`.

**6. Filter — by `resource`**

```bash
curl "http://localhost:3000/api/v1/user-permissions?resource=course" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`resource` is a lowercase identifier matched against the joined permission row.

**7. Filter — by `action`**

```bash
curl "http://localhost:3000/api/v1/user-permissions?action=publish" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Lets you answer "who has been individually granted (or denied) the `publish` action on anything?" in one query.

**8. Filter — by `scope`**

```bash
curl "http://localhost:3000/api/v1/user-permissions?scope=global" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Common scopes: `global`, `own`.

**9. Filter — status flags**

```bash
curl "http://localhost:3000/api/v1/user-permissions?isActive=true"  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/user-permissions?isDeleted=true" -H "Authorization: Bearer $ACCESS_TOKEN"
```

`isDeleted=true` is the only way to surface overrides that were soft-revoked.

**10. Free-text search**

```bash
curl "http://localhost:3000/api/v1/user-permissions?searchTerm=publish" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`searchTerm` runs an `ILIKE` against `user_name`, `perm_name`, and `perm_code` inside `udf_get_user_permissions`.

**11. Sorting — by `created_at` descending (newest first)**

```bash
curl "http://localhost:3000/api/v1/user-permissions?sortColumn=created_at&sortDirection=DESC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`sortColumn` is whitelisted to: `id` (default), `user_id`, `user_name`, `perm_name`, `perm_code`, `resource`, `grant_type`, `created_at`. Anything else returns `400 VALIDATION_ERROR`.

**12. Combined filters — every active **deny** override on `course.*`, newest first**

```bash
curl "http://localhost:3000/api/v1/user-permissions?grantType=deny&resource=course&isActive=true&sortColumn=created_at&sortDirection=DESC&pageSize=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

All filters compose with `AND`.

**13. Empty result**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

**14. Page out of range**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 999, "limit": 20, "totalCount": 23, "totalPages": 2 }
}
```

### Possible error responses

**400 — invalid `grantType`**

```bash
curl "http://localhost:3000/api/v1/user-permissions?grantType=allow" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "grantType", "message": "Invalid enum value. Expected 'grant' | 'deny', received 'allow'", "code": "invalid_enum_value" }
  ]
}
```

The same envelope shape (with a different `path` / `message`) is returned for any other bad input — `pageSize=500`, `resource=COURSE` (must be lowercase), `userId=-3`, an unknown `sortColumn`, etc. The full set of rules lives in `listUserPermissionsQuerySchema` (`api/src/modules/junctions/user-permissions.schemas.ts`).

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

## 9.2 `GET /api/v1/user-permissions/:id`

Read one override by junction id. Permission: `permission.read`.

**Sample request**

```bash
curl "http://localhost:3000/api/v1/user-permissions/91" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 91,
    "userId": 42,
    "userName": "Asha Patel",
    "permissionId": 28,
    "permName": "Publish courses",
    "permCode": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "grantType": "grant",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-08T13:00:00.000Z",
    "updatedAt": "2026-04-08T13:00:00.000Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400** — non-numeric id (`VALIDATION_ERROR` envelope, `path: "id"`).
**401** — missing or expired bearer token.
**403** — caller lacks `permission.read`.

**404 — no user-permission row with that id**

```json
{ "success": false, "message": "User-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 9.3 `POST /api/v1/user-permissions`

Assign a grant or deny override to a user. Permission: `permission.assign`.

**Sample request — grant**

```bash
curl -X POST "http://localhost:3000/api/v1/user-permissions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userId": 42, "permissionId": 28, "grantType": "grant" }'
```

**Sample request — deny**

```bash
curl -X POST "http://localhost:3000/api/v1/user-permissions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userId": 42, "permissionId": 28, "grantType": "deny" }'
```

`grantType` defaults to `grant` if omitted. A `deny` row strips a permission the user would otherwise inherit from their role; a `grant` row adds a permission the user's role does not carry.

**Response 201** — full junction row.

```json
{
  "success": true,
  "message": "User-permission assigned",
  "data": {
    "id": 91,
    "userId": 42,
    "userName": "Asha Patel",
    "permissionId": 28,
    "permName": "Publish courses",
    "permCode": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "grantType": "grant",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T16:18:55.412Z",
    "updatedAt": "2026-04-10T16:18:55.412Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — invalid `grantType`**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "grantType", "message": "Invalid enum value. Expected 'grant' | 'deny', received 'allow'", "code": "invalid_enum_value" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`, or hierarchy guard tripped (cannot grant a permission to a user who outranks the caller).

**404 — referenced user or permission does not exist**

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

**409 — duplicate override**

```json
{
  "success": false,
  "message": "User 42 already has an override for permission 28",
  "code": "DUPLICATE_ENTRY"
}
```

The full set of body rules lives in `assignUserPermissionBodySchema` (`api/src/modules/junctions/user-permissions.schemas.ts`).

---

## 9.4 `POST /api/v1/user-permissions/revoke`

Revoke a user-level override by `(userId, permissionId)` pair instead of junction id. Permission: `permission.assign`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/user-permissions/revoke" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userId": 42, "permissionId": 28 }'
```

**Response 200**

```json
{
  "success": true,
  "message": "User-permission override revoked",
  "data": { "userId": 42, "permissionId": 28, "revoked": true }
}
```

**Possible error responses**

**400** — missing/invalid `userId` or `permissionId`.
**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign` or hierarchy guard tripped.

**404 — that user does not have that override**

```json
{ "success": false, "message": "User 42 has no override for permission 28", "code": "NOT_FOUND" }
```

---

## 9.5 `DELETE /api/v1/user-permissions/:id`

Soft delete the override by junction id. Permission: `permission.assign`.

**Sample request**

```bash
curl -X DELETE "http://localhost:3000/api/v1/user-permissions/91" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "User-permission deleted",
  "data": { "id": 91, "deleted": true }
}
```

**Possible error responses**

**400** — non-numeric id.
**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`.

**404 — no user-permission row with that id**

```json
{ "success": false, "message": "User-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 9.6 `POST /api/v1/user-permissions/:id/restore`

Reverse a soft delete by junction id. Permission: `permission.assign`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/user-permissions/91/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — full restored junction row.

```json
{
  "success": true,
  "message": "User-permission restored",
  "data": {
    "id": 91,
    "userId": 42,
    "userName": "Asha Patel",
    "permissionId": 28,
    "permName": "Publish courses",
    "permCode": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "grantType": "grant",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T16:18:55.412Z",
    "updatedAt": "2026-04-10T16:42:11.005Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — row was never deleted**

```json
{
  "success": false,
  "message": "User-permission 91 is not deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `permission.assign`.
**404** — no user-permission row with that id.
