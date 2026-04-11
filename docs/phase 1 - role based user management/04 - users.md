# Phase 1 — Users

Authenticated CRUD for the user table plus three admin-only operations.

> Permission codes used by this router: `user.read`, `user.create`, `user.update`, `user.delete`, `user.restore`. The hierarchy guard runs in the database: any operation that touches another user fails with **403 FORBIDDEN** if the caller's role doesn't outrank the target's.

← [03 auth otp flows](03%20-%20auth%20otp%20flows.md) · **Next →** [05 countries](05%20-%20countries.md)

---

## 4.1 `GET /api/v1/users`

List users with rich filtering. Permission: `user.read`.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | Full-text-ish search across name, email, mobile. |
| `isActive` | bool | `true` / `false` / `1` / `0` / `yes` / `no`. |
| `isDeleted` | bool | Same. |
| `isEmailVerified` | bool | |
| `isMobileVerified` | bool | |
| `roleId` | int | |
| `roleCode` | string | E.g. `student`, `instructor`. |
| `roleLevel` | int | 0–99. |
| `countryId` | int | |
| `countryIso2` | string (2 letters) | E.g. `IN`. |
| `countryNationality` | string | |
| `sortColumn` | enum | `id`, `first_name`, `last_name`, `email`, `mobile`, `is_active`, `is_deleted`, `is_email_verified`, `is_mobile_verified`, `created_at`, `updated_at`, `role_name`, `role_code`, `role_level`, `country_name`, `country_iso2`, `country_phone_code`, `country_nationality`. Default `id`. |
| `sortDirection` | enum | `ASC` or `DESC`. Default `ASC`. |

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 42,
      "firstName": "Asha",
      "lastName": "Patel",
      "email": "asha.patel@example.com",
      "mobile": "9662278990",
      "isActive": true,
      "isEmailVerified": true,
      "isMobileVerified": true,
      "roleId": 4,
      "roleCode": "student",
      "roleName": "Student",
      "roleLevel": 90,
      "countryId": 1,
      "countryIso2": "IN",
      "countryName": "India",
      "countryPhoneCode": "+91",
      "createdAt": "2026-04-09T11:14:00.000Z",
      "updatedAt": "2026-04-10T08:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 137, "totalPages": 7 }
}
```

### Defaults — what you get if you omit everything

`GET /api/v1/users` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
isActive=∅   isDeleted=∅   isEmailVerified=∅   isMobileVerified=∅
roleId=∅     roleCode=∅    roleLevel=∅
countryId=∅  countryIso2=∅ countryNationality=∅
```

It returns the unfiltered first 20 users ordered by id ascending (the hierarchy guard does **not** filter the read path — every user the caller can see is included).

### Sample queries & responses

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (omitted from each line for brevity).

**1. Pagination — page 1, 5 rows**

```bash
curl "http://localhost:3000/api/v1/users?pageIndex=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [
    { "id": 1, "firstName": "Owner",  "lastName": "Account", "roleCode": "super_admin", "...": "..." },
    { "id": 2, "firstName": "Admin",  "lastName": "User",    "roleCode": "admin",       "...": "..." },
    { "id": 3, "firstName": "Anjali", "lastName": "Sharma",  "roleCode": "instructor",  "...": "..." },
    { "id": 4, "firstName": "Ravi",   "lastName": "Kumar",   "roleCode": "instructor",  "...": "..." },
    { "id": 5, "firstName": "Asha",   "lastName": "Patel",   "roleCode": "student",     "...": "..." }
  ],
  "meta": { "page": 1, "limit": 5, "totalCount": 137, "totalPages": 28 }
}
```

**2. Pagination — page 2, 5 rows**

```bash
curl "http://localhost:3000/api/v1/users?pageIndex=2&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`meta.page` becomes `2` and you get rows 6–10. The shape is identical.

**3. Filter — status flags**

```bash
curl "http://localhost:3000/api/v1/users?isActive=true"          -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?isDeleted=true"         -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?isEmailVerified=false"  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?isMobileVerified=false" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Boolean params accept `true|false|1|0|yes|no` (case-insensitive). `isDeleted=true` is the only way to surface soft-deleted rows.

**4. Filter — by role**

```bash
curl "http://localhost:3000/api/v1/users?roleId=4"            -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?roleCode=student"    -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?roleLevel=90"        -H "Authorization: Bearer $ACCESS_TOKEN"
```

`roleLevel` accepts `0..99`. `roleCode` is the slug from `/api/v1/roles` (e.g. `super_admin`, `admin`, `instructor`, `student`).

**5. Filter — by country**

```bash
curl "http://localhost:3000/api/v1/users?countryId=1"             -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?countryIso2=IN"          -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/users?countryNationality=Indian" -H "Authorization: Bearer $ACCESS_TOKEN"
```

`countryIso2` is normalised to upper-case server-side and must be exactly two letters; anything else returns `400 VALIDATION_ERROR`.

**6. Free-text search**

```bash
curl "http://localhost:3000/api/v1/users?searchTerm=asha" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`searchTerm` runs an `ILIKE` against `first_name`, `last_name`, `email`, and `mobile` inside `udf_get_users`. Partial matches are supported.

**7. Sorting — newest first**

```bash
curl "http://localhost:3000/api/v1/users?sortColumn=created_at&sortDirection=DESC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`sortColumn` is whitelisted (see the table above). Sorting on a join column like `role_level` or `country_iso2` is fine because those fields live on the `users_full` view the UDF reads.

**8. Combined filters — active Indian students who haven't verified email yet, newest first**

```bash
curl "http://localhost:3000/api/v1/users?isActive=true&isEmailVerified=false&roleCode=student&countryIso2=IN&sortColumn=created_at&sortDirection=DESC&pageSize=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

All filters compose with `AND`.

**9. Empty result**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

**10. Page out of range**

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 999, "limit": 20, "totalCount": 137, "totalPages": 7 }
}
```

`meta.page` echoes the requested page; `data` is empty because there are only `totalPages` real pages.

### Possible error responses

**400 — invalid `roleLevel`**

```bash
curl "http://localhost:3000/api/v1/users?roleLevel=200" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "roleLevel", "message": "roleLevel must be ≤ 99", "code": "too_big" }
  ]
}
```

The same envelope shape (with a different `path` / `message`) is returned for any other bad input — `pageSize=500`, `countryIso2=USA`, `isActive=maybe`, an unknown `sortColumn`, etc. The full set of rules lives in `listUsersQuerySchema` (`api/src/modules/users/users.schemas.ts`).

**401 — missing or expired bearer token**

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

**403 — caller is authenticated but lacks `user.read`**

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

**500** — see the global catalog in [00 — overview](00%20-%20overview.md#3-error-catalog).

---

## 4.2 `GET /api/v1/users/:id`

Read a single user by id. Permission: `user.read`.

**Sample request**

```bash
curl "http://localhost:3000/api/v1/users/42" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 42,
    "firstName": "Asha",
    "lastName": "Patel",
    "email": "asha.patel@example.com",
    "mobile": "9662278990",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "isDeleted": false,
    "roleId": 4,
    "roleCode": "student",
    "roleName": "Student",
    "roleLevel": 90,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-09T11:14:00.000Z",
    "updatedAt": "2026-04-10T08:00:00.000Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400** — non-numeric id (`VALIDATION_ERROR` envelope, `path: "id"`).
**401** — missing or expired bearer token.
**403** — caller lacks `user.read`.

**404 — no user with that id**

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.3 `POST /api/v1/users`

Admin user creation. Permission: `user.create`. Unlike `/auth/register` you can choose any role and pre-set the verification flags.

> **Side effect → email.** On success, fires `mailer.sendWelcomeAdminCreated(...)` to the new user's email with a "set your password" CTA pointing at `${APP_URL}/forgot-password?email=...`. Best-effort; logged at WARN if Brevo fails. See [11 — email notifications](11%20-%20email%20notifications.md).

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/users" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ravi",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "password": "Initial@2026",
    "roleId": 3,
    "countryId": 1,
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": false
  }'
```

At least one of `email` or `mobile` is required. The password must satisfy `passwordSchema` (8–128 chars, ≥ 1 lowercase, ≥ 1 uppercase, ≥ 1 digit). The hierarchy guard prevents the caller from creating a user at a role level the caller does not outrank.

**Response 201** — full user row.

```json
{
  "success": true,
  "message": "User created",
  "data": {
    "id": 138,
    "firstName": "Ravi",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": false,
    "isDeleted": false,
    "roleId": 3,
    "roleCode": "instructor",
    "roleName": "Instructor",
    "roleLevel": 50,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-10T17:01:42.918Z",
    "updatedAt": "2026-04-10T17:01:42.918Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — neither email nor mobile provided**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "", "message": "At least one of email or mobile is required", "code": "custom" }
  ]
}
```

**400 — weak password**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "password", "message": "password must contain at least one uppercase letter", "code": "invalid_string" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `user.create`, or attempted to assign a role at or above their own rank.

**409 — email or mobile already in use**

```json
{
  "success": false,
  "message": "User with email=ravi.kumar@example.com already exists",
  "code": "DUPLICATE_ENTRY"
}
```

The full set of body rules lives in `createUserBodySchema` (`api/src/modules/users/users.schemas.ts`).

---

## 4.4 `PATCH /api/v1/users/:id`

Update mutable profile fields. Permission: `user.update`. The hierarchy guard runs in the database.

> **Not editable here:** `email`, `mobile`, `password`, and `roleId`. Those have dedicated flows on `/auth/*` and `/users/:id/change-role` so the audit trail and OTP gates aren't bypassed.

**Sample request**

```bash
curl -X PATCH "http://localhost:3000/api/v1/users/138" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ravindra",
    "lastName": "Kumar",
    "countryId": 1,
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true
  }'
```

**Response 200** — full updated user row.

```json
{
  "success": true,
  "message": "User updated",
  "data": {
    "id": 138,
    "firstName": "Ravindra",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "isDeleted": false,
    "roleId": 3,
    "roleCode": "instructor",
    "roleName": "Instructor",
    "roleLevel": 50,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-10T17:01:42.918Z",
    "updatedAt": "2026-04-10T17:34:18.703Z",
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

**400 — tried to update a blocked field**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "email", "message": "Unrecognized key(s) in object: 'email'", "code": "unrecognized_keys" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `user.update`, or hierarchy guard tripped (target outranks caller).
**404** — no user with that id.

---

## 4.5 `DELETE /api/v1/users/:id`

Soft delete. Permission: `user.delete`. Hierarchy-guarded. Sets `is_deleted = TRUE` on the row and revokes all of the target's sessions in Redis.

> **Side effect → email.** On success, fires `mailer.sendAccountDeleted(...)` to the target user's email. Sent with admin BCC if `EMAIL_ADMIN_NOTIFY` is set. The user's contact details are read BEFORE the soft-delete so the email is still deliverable. See [11 — email notifications](11%20-%20email%20notifications.md).

**Sample request**

```bash
curl -X DELETE "http://localhost:3000/api/v1/users/138" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "User deleted",
  "data": { "id": 138, "deleted": true }
}
```

**Possible error responses**

**400** — non-numeric id.
**401** — missing or expired bearer token.
**403** — caller lacks `user.delete`, or target outranks caller.

**404 — no user with that id**

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.6 `POST /api/v1/users/:id/restore`

> **Side effect → email.** On success, fires `mailer.sendAccountRestored(...)` to the user's email. See [11 — email notifications](11%20-%20email%20notifications.md).


Reverse a soft delete. Permission: `user.restore`. Hierarchy-guarded.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/users/138/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — full restored user row.

```json
{
  "success": true,
  "message": "User restored",
  "data": {
    "id": 138,
    "firstName": "Ravindra",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "isDeleted": false,
    "roleId": 3,
    "roleCode": "instructor",
    "roleName": "Instructor",
    "roleLevel": 50,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-10T17:01:42.918Z",
    "updatedAt": "2026-04-10T17:55:09.412Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — row was never deleted**

```json
{
  "success": false,
  "message": "User 138 is not deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `user.restore`, or target outranks caller.
**404** — no user with that id.

---

## 4.7 `POST /api/v1/users/:id/change-role`

> **Side effect → email.** On success, fires `mailer.sendRoleChanged(...)` to the target user's email with both the old and new role names so the user has an audit trail. The pre-change role is snapshotted BEFORE the UDF runs. See [11 — email notifications](11%20-%20email%20notifications.md).


Promote or demote a user. Calls the hierarchy-aware UDF that prevents moving anyone to a role at or above the caller's own rank. Permission: `user.update` (super-admin in practice — you almost never have a role above your own to assign).

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/users/138/change-role" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "roleId": 3 }'
```

`roleId` is the only required field; it must be a positive integer pointing at a row in `roles`.

**Response 200** — full user row with the new role embedded.

```json
{
  "success": true,
  "message": "User role changed",
  "data": {
    "id": 138,
    "firstName": "Ravindra",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "isDeleted": false,
    "roleId": 3,
    "roleCode": "instructor",
    "roleName": "Instructor",
    "roleLevel": 50,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-10T17:01:42.918Z",
    "updatedAt": "2026-04-10T18:11:33.218Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400 — `roleId` missing**

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "roleId", "message": "must be a number", "code": "invalid_type" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — caller cannot promote/demote into the requested level (target or new role outranks caller), or caller lacks `user.update`.

**404 — user or role not found**

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.8 `POST /api/v1/users/:id/deactivate`

> **Side effect → email.** On success, fires `mailer.sendAccountDeactivated(...)` to the target user's email. The user's contact details are read BEFORE the deactivation so the email is still deliverable. See [11 — email notifications](11%20-%20email%20notifications.md).


Distinct from delete: flips `is_active = FALSE` and revokes all sessions in Redis, but keeps the row. The user can be re-activated later by patching `isActive: true`. Permission: `user.update` (super-admin in practice).

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/users/138/deactivate" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

No request body.

**Response 200** — full user row with `isActive: false`.

```json
{
  "success": true,
  "message": "User deactivated",
  "data": {
    "id": 138,
    "firstName": "Ravindra",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "isActive": false,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "isDeleted": false,
    "roleId": 3,
    "roleCode": "instructor",
    "roleName": "Instructor",
    "roleLevel": 50,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-10T17:01:42.918Z",
    "updatedAt": "2026-04-10T18:24:55.118Z",
    "deletedAt": null
  }
}
```

**Possible error responses**

**400** — non-numeric id.
**401** — missing or expired bearer token.
**403** — target outranks caller, or caller lacks `user.update`.

**404 — no user with that id**

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.9 `POST /api/v1/users/:id/set-verification`

Manually flip the email / mobile verification flags (e.g., after a support call). Bypasses the OTP flow, so it's intentionally restricted. Permission: `user.update`.

**Sample request — verify both**

```bash
curl -X POST "http://localhost:3000/api/v1/users/138/set-verification" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "isEmailVerified": true, "isMobileVerified": true }'
```

**Sample request — un-verify mobile only**

```bash
curl -X POST "http://localhost:3000/api/v1/users/138/set-verification" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "isMobileVerified": false }'
```

At least one of `isEmailVerified` / `isMobileVerified` must be supplied.

**Response 200** — full user row with the flags updated.

```json
{
  "success": true,
  "message": "User verification updated",
  "data": {
    "id": 138,
    "firstName": "Ravindra",
    "lastName": "Kumar",
    "email": "ravi.kumar@example.com",
    "mobile": "9876543210",
    "isActive": true,
    "isEmailVerified": true,
    "isMobileVerified": true,
    "isDeleted": false,
    "roleId": 3,
    "roleCode": "instructor",
    "roleName": "Instructor",
    "roleLevel": 50,
    "countryId": 1,
    "countryIso2": "IN",
    "countryName": "India",
    "countryPhoneCode": "+91",
    "countryNationality": "Indian",
    "createdAt": "2026-04-10T17:01:42.918Z",
    "updatedAt": "2026-04-10T18:39:14.802Z",
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
    { "path": "", "message": "Provide at least one of isEmailVerified or isMobileVerified", "code": "custom" }
  ]
}
```

**401** — missing or expired bearer token.
**403** — target outranks caller, or caller lacks `user.update`.
**404** — no user with that id.
