# Phase 1 — Users

Authenticated CRUD for the user table plus three admin-only operations.

> Permission codes used by this router: `user.read`, `user.create`, `user.update`, `user.delete`, `user.restore`. The hierarchy guard runs in the database: any operation that touches another user fails with **403 FORBIDDEN** if the caller's role doesn't outrank the target's.

All routes require auth. All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [03 auth otp flows](03%20-%20auth%20otp%20flows.md) · **Next →** [05 countries](05%20-%20countries.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§4.1](#41) | `GET` | `{{baseUrl}}/api/v1/users` | user.read | List / search / filter users (pagination + multi-column sort). |
| [§4.2](#42) | `GET` | `{{baseUrl}}/api/v1/users/:id` | user.read | Get a single user by numeric id. |
| [§4.3](#43) | `POST` | `{{baseUrl}}/api/v1/users` | user.create | Create a new user. |
| [§4.4](#44) | `PATCH` | `{{baseUrl}}/api/v1/users/:id` | user.update | Partial update of a user profile. |
| [§4.5](#45) | `DELETE` | `{{baseUrl}}/api/v1/users/:id` | **super_admin** + user.delete | Soft-delete a user. |
| [§4.6](#46) | `POST` | `{{baseUrl}}/api/v1/users/:id/restore` | **super_admin** + user.restore | Undo a soft-delete (sets `is_deleted=false`). |
| [§4.7](#47) | `POST` | `{{baseUrl}}/api/v1/users/:id/change-role` | user.manage_roles | Change a user's role assignment. |
| [§4.8](#48) | `POST` | `{{baseUrl}}/api/v1/users/:id/deactivate` | user.update | Flip `is_active` off without deleting. |
| [§4.9](#49) | `POST` | `{{baseUrl}}/api/v1/users/:id/set-verification` | user.manage_verification | Admin override of `isEmailVerified` / `isMobileVerified`. |

---

## 4.1 `GET /api/v1/users`

List users with rich filtering. Permission: `user.read`.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/users` |
| Permission | `user.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Standard pagination. |
| `searchTerm` | string | — | Full-text-ish search across name, email, mobile. |
| `isActive` | bool | — | `true` / `false` / `1` / `0` / `yes` / `no`. |
| `isDeleted` | bool | — | Same. |
| `isEmailVerified` | bool | — | |
| `isMobileVerified` | bool | — | |
| `roleId` | int | — | |
| `roleCode` | string | — | E.g. `student`, `instructor`. |
| `roleLevel` | int | — | 0–99. |
| `countryId` | int | — | |
| `countryIso2` | string (2 letters) | — | E.g. `IN`. |
| `countryNationality` | string | — | |
| `sortColumn` | enum | `id` | `id`, `first_name`, `last_name`, `email`, `mobile`, `is_active`, `is_deleted`, `is_email_verified`, `is_mobile_verified`, `created_at`, `updated_at`, `role_name`, `role_code`, `role_level`, `country_name`, `country_iso2`, `country_phone_code`, `country_nationality`. |
| `sortDirection` | enum | `ASC` | `ASC` or `DESC`. |

**Request body** — none.

### Responses

#### 200 OK

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

#### 400 VALIDATION_ERROR

Invalid `roleLevel`, `pageSize`, unknown `sortColumn`, or any other query coercion failure.

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

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
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

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/...` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Page 3, large page | `?pageIndex=3&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search name/email/mobile — `patel` | `?searchTerm=patel` |
| Search + pagination | `?pageIndex=2&pageSize=20&searchTerm=patel` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Soft-deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Email-verified only | `?isEmailVerified=true` |
| Mobile-verified only | `?isMobileVerified=true` |
| Fully verified (email + mobile) | `?isEmailVerified=true&isMobileVerified=true` |
| Role filter by id | `?roleId=4` |
| Role filter by code | `?roleCode=student` |
| Role filter by level | `?roleLevel=50` |
| Country filter by id | `?countryId=1` |
| Country filter by ISO-2 | `?countryIso2=IN` |
| Country filter by nationality | `?countryNationality=Indian` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `first_name` ASC | `?sortColumn=first_name&sortDirection=ASC` |
| Sort by `last_name` ASC | `?sortColumn=last_name&sortDirection=ASC` |
| Sort by `email` ASC | `?sortColumn=email&sortDirection=ASC` |
| Sort by `mobile` ASC | `?sortColumn=mobile&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `is_email_verified` DESC | `?sortColumn=is_email_verified&sortDirection=DESC` |
| Sort by `is_mobile_verified` DESC | `?sortColumn=is_mobile_verified&sortDirection=DESC` |
| Sort by `created_at` DESC (newest first) | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Sort by `role_name` ASC | `?sortColumn=role_name&sortDirection=ASC` |
| Sort by `role_code` ASC | `?sortColumn=role_code&sortDirection=ASC` |
| Sort by `role_level` ASC | `?sortColumn=role_level&sortDirection=ASC` |
| Sort by `country_name` ASC | `?sortColumn=country_name&sortDirection=ASC` |
| Sort by `country_iso2` ASC | `?sortColumn=country_iso2&sortDirection=ASC` |
| Sort by `country_phone_code` ASC | `?sortColumn=country_phone_code&sortDirection=ASC` |
| Sort by `country_nationality` ASC | `?sortColumn=country_nationality&sortDirection=ASC` |
| Combo — active Indian students, sort by name | `?pageIndex=1&pageSize=50&isActive=true&roleCode=student&countryIso2=IN&sortColumn=first_name&sortDirection=ASC` |
| Combo — page 2 of verified instructors sorted newest | `?pageIndex=2&pageSize=50&isActive=true&isEmailVerified=true&isMobileVerified=true&roleCode=instructor&sortColumn=created_at&sortDirection=DESC` |
| Combo — full-text `patel` in country IN, page 1 | `?pageIndex=1&pageSize=20&searchTerm=patel&countryIso2=IN&sortColumn=first_name&sortDirection=ASC` |

---

## 4.2 `GET /api/v1/users/:id`

Read a single user by id. Permission: `user.read`.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/users/:id` |
| Permission | `user.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body** — none.

### Responses

#### 200 OK

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

#### 400 VALIDATION_ERROR

Non-numeric `:id`.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "id", "message": "Expected number, received nan", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.3 `POST /api/v1/users`

Admin user creation. Permission: `user.create`. Unlike `/auth/register` you can choose any role and pre-set the verification flags.

> **Side effect → email.** On success, fires `mailer.sendWelcomeAdminCreated(...)` to the new user's email with a "set your password" CTA pointing at `${APP_URL}/forgot-password?email=...`. Best-effort; logged at WARN if Brevo fails. See [11 — email notifications](11%20-%20email%20notifications.md).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/users` |
| Permission | `user.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

```json
{
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
}
```

**Required fields**: `firstName`, `lastName`, `password`, `roleId`, `countryId`. At least one of `email` or `mobile` is required.

**Optional fields**: `isActive` (defaults to **`false`** at the API layer — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)), `isEmailVerified`, `isMobileVerified`.

The password must satisfy `passwordSchema` (8–128 chars, ≥ 1 lowercase, ≥ 1 uppercase, ≥ 1 digit). The hierarchy guard prevents the caller from creating a user at a role level the caller does not outrank.

### Responses

#### 201 CREATED

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

#### 400 VALIDATION_ERROR — missing required field

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "firstName", "message": "Required", "code": "invalid_type" },
    { "path": "roleId", "message": "must be a number", "code": "invalid_type" }
  ]
}
```

#### 400 VALIDATION_ERROR — neither email nor mobile provided

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

#### 400 VALIDATION_ERROR — weak password

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

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Caller lacks `user.create`, or attempted to assign a role at or above their own rank.

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "User with email=ravi.kumar@example.com already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 4.4 `PATCH /api/v1/users/:id`

Update mutable profile fields. Permission: `user.update`. The hierarchy guard runs in the database.

> **Not editable here:** `email`, `mobile`, `password`, and `roleId`. Those have dedicated flows on `/auth/*` and `/users/:id/change-role` so the audit trail and OTP gates aren't bypassed.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/users/:id` |
| Permission | `user.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body** — any subset of fields, but at least one:

```json
{
  "firstName": "Ravindra",
  "lastName": "Kumar",
  "countryId": 1,
  "isActive": true,
  "isEmailVerified": true,
  "isMobileVerified": true
}
```

### Responses

#### 200 OK

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

#### 400 VALIDATION_ERROR — empty body

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

#### 400 VALIDATION_ERROR — tried to update a blocked field

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

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Caller lacks `user.update`, or hierarchy guard tripped (target outranks caller).

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.5 `DELETE /api/v1/users/:id`

Soft delete. **Requires `super_admin` role** + permission: `user.delete`. Hierarchy-guarded. Sets `is_deleted = TRUE` on the row and revokes all of the target's sessions in Redis.

> **Side effect → email.** On success, fires `mailer.sendAccountDeleted(...)` to the target user's email. Sent with admin BCC if `EMAIL_ADMIN_NOTIFY` is set. The user's contact details are read BEFORE the soft-delete so the email is still deliverable. See [11 — email notifications](11%20-%20email%20notifications.md).

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/users/:id` |
| Permission | `**super_admin** + user.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User deleted",
  "data": { "id": 138, "deleted": true }
}
```

#### 400 VALIDATION_ERROR

Non-numeric id.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "id", "message": "Expected number", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Caller lacks `user.delete`, or target outranks caller.

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.6 `POST /api/v1/users/:id/restore`

Reverse a soft delete. **Requires `super_admin` role** + permission: `user.restore`. Hierarchy-guarded.

> **Side effect → email.** On success, fires `mailer.sendAccountRestored(...)` to the user's email. See [11 — email notifications](11%20-%20email%20notifications.md).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/users/:id/restore` |
| Permission | `**super_admin** + user.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body** — none.

### Responses

#### 200 OK

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

#### 400 BAD_REQUEST

Row was never deleted.

```json
{
  "success": false,
  "message": "User 138 is not deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Caller lacks `user.restore`, or target outranks caller.

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.7 `POST /api/v1/users/:id/change-role`

Promote or demote a user. Calls the hierarchy-aware UDF that prevents moving anyone to a role at or above the caller's own rank. Permission: `user.update` (super-admin in practice — you almost never have a role above your own to assign).

> **Side effect → email.** On success, fires `mailer.sendRoleChanged(...)` to the target user's email with both the old and new role names so the user has an audit trail. The pre-change role is snapshotted BEFORE the UDF runs. See [11 — email notifications](11%20-%20email%20notifications.md).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/users/:id/change-role` |
| Permission | `user.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body**

```json
{ "roleId": 3 }
```

`roleId` is the only required field; it must be a positive integer pointing at a row in `roles`.

### Responses

#### 200 OK

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

#### 400 VALIDATION_ERROR

`roleId` missing.

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

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Caller cannot promote/demote into the requested level (target or new role outranks caller), or caller lacks `user.update`.

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

User or role not found.

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.8 `POST /api/v1/users/:id/deactivate`

Distinct from delete: flips `is_active = FALSE` and revokes all sessions in Redis, but keeps the row. The user can be re-activated later by patching `isActive: true`. Permission: `user.update` (super-admin in practice).

> **Side effect → email.** On success, fires `mailer.sendAccountDeactivated(...)` to the target user's email. The user's contact details are read BEFORE the deactivation so the email is still deliverable. See [11 — email notifications](11%20-%20email%20notifications.md).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/users/:id/deactivate` |
| Permission | `user.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body** — none.

### Responses

#### 200 OK

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

#### 400 VALIDATION_ERROR

Non-numeric id.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "id", "message": "Expected number", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Target outranks caller, or caller lacks `user.update`.

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## 4.9 `POST /api/v1/users/:id/set-verification`

Manually flip the email / mobile verification flags (e.g., after a support call). Bypasses the OTP flow, so it's intentionally restricted. Permission: `user.update`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/users/:id/set-verification` |
| Permission | `user.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric user id. |

**Request body** — at least one of the fields below:

*Verify both channels:*

```json
{ "isEmailVerified": true, "isMobileVerified": true }
```

*Un-verify mobile only:*

```json
{ "isMobileVerified": false }
```

### Responses

#### 200 OK

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

#### 400 VALIDATION_ERROR — empty body

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

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

Target outranks caller, or caller lacks `user.update`.

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all user routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body (weak password, neither email nor mobile supplied, empty body, unknown sort column, etc). |
| 400 | `BAD_REQUEST` | Row was never deleted (on restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission, or hierarchy guard tripped (target outranks caller). |
| 404 | `NOT_FOUND` | No user with that id, or a dependent id (role) not found. |
| 409 | `DUPLICATE_ENTRY` | Email or mobile already in use. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
