# Phase 1 — Walkthrough and Endpoint Index

← [09 user-permissions](09%20-%20user-permissions.md) · **Next →** [11 email notifications](11%20-%20email%20notifications.md)

A worked end-to-end happy path showing the permission and user-permission workflows, followed by a flat table of every endpoint exposed in Phase 1 with its required permission code.

---

## 1. Prerequisites

- API running locally at `http://localhost:3000` (see repo `README.md`).
- Phase 1 seed data applied — the Super Admin user exists and has a password.
- A Postman environment with `{{baseUrl}}` set to `http://localhost:3000` and `{{accessToken}}` minted via the login request documented in [02 § 2.2](02%20-%20auth%20core.md#22-post-apiv1authlogin).

---

## 2. The happy path — Permission assignment and user overrides

The walkthrough below shows how to bind a permission to a role, then layer a user-level override on top.

### Step 1 — Create a permission (if you need a new one)

| What you want | Request | Doc |
|---|---|---|
| Create a new permission | `POST {{baseUrl}}/api/v1/permissions` with `{ "resource": "course", "action": "publish", "scope": "global", "description": "..." }` | [07 § 7.3](07%20-%20permissions.md#73-post-apiv1permissions) |

Capture `data.id` as `permissionId` in your Postman environment.

### Step 2 — Assign the permission to a role

| What you want | Request | Doc |
|---|---|---|
| Assign permission to role | `POST {{baseUrl}}/api/v1/role-permissions` with `{ "roleId": 4, "permissionId": 28 }` | [08 § 8.3](08%20-%20role-permissions.md#83-post-apiv1role-permissions) |

The response confirms `{ success, message: "Role-permission assigned", data: { id, roleId, roleName, permissionId, permName, permCode, ... } }`. Capture `data.id` as `rolePermissionId` if you need to revoke or delete it later.

### Step 3 — List all Student role grants

| What you want | Request | Doc |
|---|---|---|
| See all permissions granted to the student role | `GET {{baseUrl}}/api/v1/role-permissions?roleCode=student&pageSize=50` | [08 § 8.1](08%20-%20role-permissions.md#81-get-apiv1role-permissions) |

The response lists every (role-permission id, permission code, resource, action) tuple. Use `sortColumn=perm_code` to group by permission for easier auditing.

### Step 4 — Grant an extra permission to a specific user (override)

| What you want | Request | Doc |
|---|---|---|
| Grant an extra permission to user 42 | `POST {{baseUrl}}/api/v1/user-permissions` with `{ "userId": 42, "permissionId": 28, "grantType": "grant" }` | [09 § 9.3](09%20-%20user-permissions.md#93-post-apiv1user-permissions) |

The response includes the full override row. Capture `data.id` as `userPermissionId`.

### Step 5 — Deny a role-based permission for a user (override)

| What you want | Request | Doc |
|---|---|---|
| Explicitly deny user 42 a permission they'd inherit from their role | `POST {{baseUrl}}/api/v1/user-permissions` with `{ "userId": 42, "permissionId": 17, "grantType": "deny" }` | [09 § 9.3](09%20-%20user-permissions.md#93-post-apiv1user-permissions) |

The effective permission computation at login is: (role grants) ∪ (granted overrides) − (denied overrides). This allow list / block list approach is simple and powerful.

### Step 6 — Audit what a user actually has

| What you want | Request | Doc |
|---|---|---|
| See all overrides for user 42 | `GET {{baseUrl}}/api/v1/user-permissions?userId=42` | [09 § 9.1](09%20-%20user-permissions.md#91-get-apiv1user-permissions) |

The response shows every grant and deny override for that user, from which you can reconstruct their effective permission set by hand (or the API does it at login via `udf_auth_get_user_permissions`).

### Step 7 — Revoke a role-level assignment

| What you want | Request | Doc |
|---|---|---|
| Remove permission 28 from the student role | `POST {{baseUrl}}/api/v1/role-permissions/revoke` with `{ "roleId": 4, "permissionId": 28 }` | [08 § 8.4](08%20-%20role-permissions.md#84-post-apiv1role-permissionsrevoke) |

Or, if you know the junction id, `DELETE {{baseUrl}}/api/v1/role-permissions/{{rolePermissionId}}` (§ 8.5). Delete is soft; soft-deleted rows are invisible to list queries unless `isDeleted=true`.

### Step 8 — Revoke a user-level override

| What you want | Request | Doc |
|---|---|---|
| Remove the grant/deny override for user 42 + permission 28 | `POST {{baseUrl}}/api/v1/user-permissions/revoke` with `{ "userId": 42, "permissionId": 28 }` | [09 § 9.4](09%20-%20user-permissions.md#94-post-apiv1user-permissionsrevoke) |

Or delete by id: `DELETE {{baseUrl}}/api/v1/user-permissions/{{userPermissionId}}` (§ 9.5).

### Step 9 — Restore a soft-deleted assignment

| What you want | Request | Doc |
|---|---|---|
| Bring back a deleted role-permission | `POST {{baseUrl}}/api/v1/role-permissions/{{rolePermissionId}}/restore` | [08 § 8.6](08%20-%20role-permissions.md#86-post-apiv1role-permissionsidrestore) |
| Bring back a deleted user-permission | `POST {{baseUrl}}/api/v1/user-permissions/{{userPermissionId}}/restore` | [09 § 9.6](09%20-%20user-permissions.md#96-post-apiv1user-permissionsidrestore) |

Both routes set `is_deleted = FALSE` and return the full refreshed row.

---

## 3. Hierarchy rules and their errors

The **hierarchy guard** prevents users from assigning permissions to others who outrank them in the role pyramid. This safeguards against privilege escalation.

- **Super Admin** is level 0 (top of hierarchy).
- **Admin** is level 1.
- **Instructor** and **Student** are level 90 (leaves).

An admin (level 1) can:
- Grant/deny permissions on an instructor or student.
- NOT grant/deny permissions on another admin or a super-admin.

A student (level 90) cannot assign permissions to anyone.

If you try to grant permission 28 to a user who outranks you, the UDF returns:

```json
{
  "success": false,
  "message": "Permission denied: permission.assign",
  "code": "FORBIDDEN"
}
```

The hierarchy check happens at the service layer before the UDF call, so the error message is generic. Plan your admin workflows with this rule in mind.

---

## 4. Endpoint index

| Method | Path | Auth | Permission | Doc |
|---|---|---|---|---|
| GET | `/api/v1/health` | public | — | [01 health](01%20-%20health.md) |
| GET | `/api/v1/health/ready` | public | — | [01 health](01%20-%20health.md) |
| POST | `/api/v1/auth/register` | public | — | [02 § 2.1](02%20-%20auth%20core.md#21-post-apiv1authregister) |
| POST | `/api/v1/auth/register/verify-email` | public | — | [02 § 2.1a](02%20-%20auth%20core.md#21a-post-apiv1authregisterverify-email) |
| POST | `/api/v1/auth/register/verify-mobile` | public | — | [02 § 2.1b](02%20-%20auth%20core.md#21b-post-apiv1authregisterverify-mobile) |
| POST | `/api/v1/auth/register/resend-email` | public | — | [02 § 2.1c](02%20-%20auth%20core.md#21c-post-apiv1authregisterresend-email) |
| POST | `/api/v1/auth/register/resend-mobile` | public | — | [02 § 2.1d](02%20-%20auth%20core.md#21d-post-apiv1authregisterresend-mobile) |
| POST | `/api/v1/auth/login` | public | — | [02 § 2.2](02%20-%20auth%20core.md#22-post-apiv1authlogin) |
| POST | `/api/v1/auth/logout` | bearer | — | [02 § 2.3](02%20-%20auth%20core.md#23-post-apiv1authlogout) |
| POST | `/api/v1/auth/refresh` | public | — | [02 § 2.4](02%20-%20auth%20core.md#24-post-apiv1authrefresh) |
| GET | `/api/v1/auth/me` | bearer | — | [02 § 2.5](02%20-%20auth%20core.md#25-get-apiv1authme) |
| POST | `/api/v1/auth/forgot-password` | public | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/forgot-password/verify` | public | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/reset-password` | bearer | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/reset-password/verify` | bearer | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/verify-email` | bearer | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/verify-email/confirm` | bearer | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/verify-mobile` | bearer | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/verify-mobile/confirm` | bearer | — | [03 auth otp flows](03%20-%20auth%20otp%20flows.md) |
| POST | `/api/v1/auth/change-email` | bearer | — | [04 email and mobile](04%20-%20email%20and%20mobile.md) |
| POST | `/api/v1/auth/change-email/confirm` | bearer | — | [04 email and mobile](04%20-%20email%20and%20mobile.md) |
| POST | `/api/v1/auth/change-mobile` | bearer | — | [04 email and mobile](04%20-%20email%20and%20mobile.md) |
| POST | `/api/v1/auth/change-mobile/confirm` | bearer | — | [04 email and mobile](04%20-%20email%20and%20mobile.md) |
| GET | `/api/v1/users` | bearer | `user.read` | [05 users](05%20-%20users.md) |
| GET | `/api/v1/users/:id` | bearer | `user.read` | [05 users](05%20-%20users.md) |
| POST | `/api/v1/users` | bearer | `user.create` | [05 users](05%20-%20users.md) |
| PATCH | `/api/v1/users/:id` | bearer | `user.update` | [05 users](05%20-%20users.md) |
| DELETE | `/api/v1/users/:id` | bearer | `user.delete` | [05 users](05%20-%20users.md) |
| POST | `/api/v1/users/:id/restore` | bearer | `user.restore` | [05 users](05%20-%20users.md) |
| POST | `/api/v1/users/:id/change-role` | bearer | `user.update` (super-admin only) | [05 users](05%20-%20users.md) |
| POST | `/api/v1/users/:id/deactivate` | bearer | `user.update` (super-admin only) | [05 users](05%20-%20users.md) |
| POST | `/api/v1/users/:id/set-verification` | bearer | `user.update` | [05 users](05%20-%20users.md) |
| GET | `/api/v1/countries` | bearer | `country.read` | [06 master data](06%20-%20master%20data.md) |
| GET | `/api/v1/countries/:id` | bearer | `country.read` | [06 master data](06%20-%20master%20data.md) |
| POST | `/api/v1/countries` | bearer | `country.create` | [06 master data](06%20-%20master%20data.md) |
| PATCH | `/api/v1/countries/:id` | bearer | `country.update` | [06 master data](06%20-%20master%20data.md) |
| DELETE | `/api/v1/countries/:id` | bearer | `country.delete` | [06 master data](06%20-%20master%20data.md) |
| POST | `/api/v1/countries/:id/restore` | bearer | `country.restore` | [06 master data](06%20-%20master%20data.md) |
| GET | `/api/v1/roles` | bearer | `role.read` | [06 master data](06%20-%20master%20data.md) |
| GET | `/api/v1/roles/:id` | bearer | `role.read` | [06 master data](06%20-%20master%20data.md) |
| POST | `/api/v1/roles` | bearer | `role.create` | [06 master data](06%20-%20master%20data.md) |
| PATCH | `/api/v1/roles/:id` | bearer | `role.update` | [06 master data](06%20-%20master%20data.md) |
| DELETE | `/api/v1/roles/:id` | bearer | `role.delete` | [06 master data](06%20-%20master%20data.md) |
| POST | `/api/v1/roles/:id/restore` | bearer | `role.restore` | [06 master data](06%20-%20master%20data.md) |
| GET | `/api/v1/permissions` | bearer | `permission.read` | [07 permissions](07%20-%20permissions.md) |
| GET | `/api/v1/permissions/:id` | bearer | `permission.read` | [07 permissions](07%20-%20permissions.md) |
| POST | `/api/v1/permissions` | bearer | `permission.create` | [07 permissions](07%20-%20permissions.md) |
| PATCH | `/api/v1/permissions/:id` | bearer | `permission.update` | [07 permissions](07%20-%20permissions.md) |
| DELETE | `/api/v1/permissions/:id` | bearer | `permission.delete` | [07 permissions](07%20-%20permissions.md) |
| POST | `/api/v1/permissions/:id/restore` | bearer | `permission.restore` | [07 permissions](07%20-%20permissions.md) |
| GET | `/api/v1/role-permissions` | bearer | `permission.read` | [08 § 8.1](08%20-%20role-permissions.md#81-get-apiv1role-permissions) |
| GET | `/api/v1/role-permissions/:id` | bearer | `permission.read` | [08 § 8.2](08%20-%20role-permissions.md#82-get-apiv1role-permissionsid) |
| POST | `/api/v1/role-permissions` | bearer | `permission.assign` | [08 § 8.3](08%20-%20role-permissions.md#83-post-apiv1role-permissions) |
| POST | `/api/v1/role-permissions/revoke` | bearer | `permission.assign` | [08 § 8.4](08%20-%20role-permissions.md#84-post-apiv1role-permissionsrevoke) |
| DELETE | `/api/v1/role-permissions/:id` | bearer | `permission.assign` | [08 § 8.5](08%20-%20role-permissions.md#85-delete-apiv1role-permissionsid) |
| POST | `/api/v1/role-permissions/:id/restore` | bearer | `permission.assign` | [08 § 8.6](08%20-%20role-permissions.md#86-post-apiv1role-permissionsidrestore) |
| GET | `/api/v1/user-permissions` | bearer | `permission.read` | [09 § 9.1](09%20-%20user-permissions.md#91-get-apiv1user-permissions) |
| GET | `/api/v1/user-permissions/:id` | bearer | `permission.read` | [09 § 9.2](09%20-%20user-permissions.md#92-get-apiv1user-permissionsid) |
| POST | `/api/v1/user-permissions` | bearer | `permission.assign` | [09 § 9.3](09%20-%20user-permissions.md#93-post-apiv1user-permissions) |
| POST | `/api/v1/user-permissions/revoke` | bearer | `permission.assign` | [09 § 9.4](09%20-%20user-permissions.md#94-post-apiv1user-permissionsrevoke) |
| DELETE | `/api/v1/user-permissions/:id` | bearer | `permission.assign` | [09 § 9.5](09%20-%20user-permissions.md#95-delete-apiv1user-permissionsid) |
| POST | `/api/v1/user-permissions/:id/restore` | bearer | `permission.assign` | [09 § 9.6](09%20-%20user-permissions.md#96-post-apiv1user-permissionsidrestore) |
