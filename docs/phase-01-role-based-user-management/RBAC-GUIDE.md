# RBAC (Role-Based Access Control) Guide

## How It Works — Simple Explanation

Think of RBAC like a company hierarchy. Every user gets a **role** (like a job title), and each role comes with a set of **permissions** (what that job title allows you to do). When a user tries to do something (like delete a user or create a course), the system checks: "Does this person's role have the permission to do that?"

---

## Roles

The system has 8 built-in roles, ordered from most powerful to least powerful:

| Level | Role | What they can do |
|-------|------|------------------|
| 0 | **Super Admin** | Everything. Full control. Can delete and restore anything. |
| 1 | **Admin** | Almost everything, but **cannot delete or restore** anything. Cannot create other admins. |
| 2 | **Moderator** | Approve/reject content, moderate discussions, handle tickets |
| 2 | **Content Manager** | Create and manage courses, blogs, FAQs, announcements |
| 2 | **Finance Admin** | Manage orders, wallets, coupons, financial reports |
| 3 | **Support Agent** | Handle support tickets, view orders and enrollments |
| 4 | **Instructor** | Create and manage their own courses, assessments, webinars |
| 5 | **Student** | Enroll in courses, submit reviews, view their own data |

---

## Permission Rules

### Who can do what?

**Super Admin (Level 0):**
- Can create any user and assign any role (Super Admin, Admin, etc.)
- Can delete and restore any record in the system
- **Cannot** delete themselves
- **Cannot** delete other Super Admins
- Is the only role that has `*.delete` and `*.restore` permissions

**Admin (Level 1):**
- Can create users and assign roles **except** Super Admin and Admin roles
- Can read, create, and update almost everything
- **Cannot delete or restore anything** (no `*.delete` or `*.restore` permissions)
- **Cannot create another Admin or Super Admin**

**All other roles (Level 2+):**
- Have specific permissions based on their job
- Cannot delete or restore anything
- Cannot assign roles to anyone

### Protected Roles

**Student** and **Instructor** are protected roles:
- They are **automatically assigned** (Student on registration, Instructor by Super Admin)
- **Only Super Admin** can add, change, or remove these roles from a user
- Admin and other roles cannot touch Student or Instructor role assignments

---

## How Permissions Are Structured

Each permission has a code like `module.action`. For example:

- `user.read` — Can view users
- `user.create` — Can create users
- `user.delete` — Can delete users (Super Admin only)
- `user.restore` — Can restore deleted users (Super Admin only)
- `course.read.own` — Can view only their own courses

### Permission Actions

| Action | Meaning | Who has it |
|--------|---------|------------|
| `read` | View/list records | Most roles |
| `create` | Create new records | Admin and relevant roles |
| `update` | Edit existing records | Admin and relevant roles |
| `delete` | Soft-delete records | **Super Admin only** |
| `restore` | Restore deleted records | **Super Admin only** |
| `approve` / `reject` | Approve or reject content | Moderators, Content Managers |
| `publish` / `unpublish` | Make content live or take it down | Moderators, Content Managers |
| `manage` | Full control over a feature | Specific roles |
| `assign` | Assign roles to users | Super Admin, Admin (limited) |

---

## Auto-Assign Permissions (Database Trigger)

When a developer adds a new API endpoint and creates a new permission in the database, permissions are **automatically assigned** to the right roles. No manual work needed.

### How it works:

A PostgreSQL trigger (`trg_auto_assign_permission`) fires every time a new permission is inserted into the `permissions` table:

1. **Super Admin** always gets the new permission (regardless of what it is)
2. **Admin** gets the new permission **only if** the action is NOT `delete` or `restore`

### Example:

If you add a new permission `invoice.create` (action = `create`):
- Super Admin gets it automatically
- Admin gets it automatically

If you add `invoice.delete` (action = `delete`):
- Super Admin gets it automatically
- Admin does NOT get it (because it's a delete action)

### Where is this trigger?

- **Database function:** `fn_auto_assign_permission_to_roles()`
- **Trigger:** `trg_auto_assign_permission` on the `permissions` table
- **SQL file:** `Database_Schema/migration-002-auto-assign-trigger-and-guards.sql`

---

## Admin Create User with Role Assignment

When an admin creates a user via `POST /api/v1/users`, they can optionally pass a `roleId` field in the request body. This assigns the role to the new user in a single step (instead of creating the user first, then assigning the role separately).

### How it works:

1. Admin calls `POST /api/v1/users` with user details + optional `roleId`
2. The system checks RBAC guards **before** creating the user
3. If guards pass, user is created and the role is assigned automatically
4. The response returns the full user object

### RBAC Guards on `roleId`:

| Who is creating? | What role are they assigning? | Result |
|------------------|-------------------------------|--------|
| **Super Admin** | Any role | **Allowed** |
| **Admin** | moderator, content_manager, finance_admin, support_agent | **Allowed** |
| **Admin** | super_admin or admin | **Blocked** — "Admins cannot assign Super Admin or Admin roles" |
| **Admin** | student or instructor | **Blocked** — "Only Super Admin can assign Student or Instructor roles" |

### Example request body:

```json
{
  "firstName": "Rajesh",
  "lastName": "Kumar",
  "email": "rajesh@example.com",
  "password": "SecurePass123",
  "countryId": 1,
  "roleId": 3
}
```

If `roleId` is not provided, the user is created without any role. You can assign a role later using the User Role Assignments API.

### Important — automatic defaults:

Admin-created users are always created with `isActive = false`, `isEmailVerified = false`, `isMobileVerified = false`. These fields are **not** accepted in the request body — they are set automatically. Super Admin must activate the user manually via the update endpoint.

### Where is this code?

- **File:** `src/modules/users/user.service.ts` — `create()` method
- **DTO:** `src/api/v1/users/user.dto.ts` — `createUserDto` includes optional `roleId`

---

## Role on Registration (Student or Instructor)

When a new user registers through the `/auth/register` endpoint, they can choose to register as a **Student** or **Instructor**. The role is passed via the optional `roleCode` field. If not provided, it defaults to `student`.

### Request body:

```json
{
  "firstName": "Girish",
  "lastName": "Kumar",
  "email": "girish@example.com",
  "mobile": "9876543210",
  "password": "SecurePass1",
  "roleCode": "instructor"
}
```

### Rules:

- `roleCode` is optional. Allowed values: `student` (default) or `instructor`
- If `roleCode` is not provided, user is registered as a **Student**
- Any value other than `student` or `instructor` is rejected with a 400 error
- Other roles (admin, moderator, etc.) **cannot** be self-registered — they must be created by an Admin/Super Admin via `POST /api/v1/users`

### Flow:

1. User calls `POST /auth/register/initiate` with their details + optional `roleCode`
2. User verifies OTP via `POST /auth/register/verify-otp`
3. User account is created with `isEmailVerified = true`, `isMobileVerified = true`, `isActive = true`
4. The chosen role (student or instructor) is **automatically assigned**
5. User receives access token and can start using the app

### Where is this code?

- **DTO:** `src/api/v1/auth/auth.dto.ts` — `registerInitiateDto` includes optional `roleCode` with enum validation
- **Service:** `src/modules/auth/auth.service.ts` — `registerVerifyOtp()` assigns the role from `pending.roleCode`

---

## Role Assignment Guards

When someone tries to assign a role to a user (via the user-role-assignments API), the system checks several rules:

### Guard Rules:

| Rule | What happens |
|------|-------------|
| Admin tries to assign `super_admin` role | Blocked with 403 error |
| Admin tries to assign `admin` role | Blocked with 403 error |
| Admin tries to remove/modify `student` or `instructor` role | Blocked with 403 error |
| Non-Super Admin tries to assign `student` or `instructor` role | Blocked with 403 error |
| Super Admin assigns any role | Allowed |

### Error Codes:

| Code | Meaning |
|------|---------|
| `ADMIN_CANNOT_ASSIGN_ADMIN` | Admin tried to assign Super Admin or Admin role |
| `CANNOT_ASSIGN_PROTECTED_ROLE` | Non-Super Admin tried to assign Student or Instructor role |
| `CANNOT_MODIFY_PROTECTED_ROLE` | Non-Super Admin tried to modify a Student/Instructor assignment |
| `ADMIN_CANNOT_MODIFY_ADMIN` | Admin tried to modify a Super Admin or Admin assignment |
| `CANNOT_DELETE_PROTECTED_ROLE` | Non-Super Admin tried to remove Student/Instructor role |
| `ADMIN_CANNOT_DELETE_ADMIN` | Admin tried to remove Super Admin or Admin role assignment |

### Where is this code?

- **File:** `src/modules/user-role-assignments/user-role-assignment.service.ts`

---

## Delete/Restore Guards

Even though only Super Admin has delete permissions (enforced by RBAC), there are additional application-level guards:

### User Deletion:

| Scenario | Result |
|----------|--------|
| Super Admin deletes a regular user | Allowed |
| Super Admin deletes another Super Admin | **Blocked** — "Super Admin accounts cannot be deleted" |
| Super Admin deletes themselves | **Blocked** — "You cannot delete your own account" |

### Role Deletion:

| Scenario | Result |
|----------|--------|
| Super Admin deletes a custom role | Allowed |
| Super Admin deletes the Super Admin role | **Blocked** — "The Super Admin role cannot be deleted" |

### Where is this code?

- **User guards:** `src/modules/users/user.service.ts` — `delete()` method
- **Role guards:** `src/modules/roles/role.service.ts` — `delete()` method

---

## Logout Endpoint

`POST /api/v1/auth/logout`

Requires authentication (Bearer token). Revokes the user's session in Redis, making the access token immediately invalid. All subsequent API calls with that token will receive a 401 error.

### Where is this code?

- **Route:** `src/api/v1/auth/auth.routes.ts`
- **Controller:** `src/api/v1/auth/auth.controller.ts`
- **Service:** `src/modules/auth/auth.service.ts` — `logout()` method

---

## How Permission Checking Works (Technical)

1. User makes an API request (e.g., `DELETE /api/v1/users/5`)
2. **`authMiddleware`** verifies the JWT token and checks Redis session is valid
3. **`authorize('user.delete')`** middleware calls `udf_user_has_permission(userId, 'user.delete')` in PostgreSQL
4. The UDF checks: does this user have any active role that has the `user.delete` permission?
5. If yes → request proceeds to the controller
6. If no → returns 403 Forbidden

### The chain:

```
Request → authMiddleware → authorize('permission.code') → Controller → Service → Repository → Database
```

---

## Database Tables Involved

| Table | Purpose |
|-------|---------|
| `roles` | Defines roles (Super Admin, Admin, Student, etc.) |
| `permissions` | Defines permissions (user.read, user.delete, etc.) |
| `role_permissions` | Maps which roles have which permissions |
| `user_role_assignments` | Maps which users have which roles |
| `modules` | Groups permissions into categories (User Management, Course Management, etc.) |

### Key UDF (User-Defined Function):

- **`udf_user_has_permission(userId, permissionCode)`** — Returns true/false. This is the core function that the `authorize` middleware calls.

---

## Migration Files

| File | Purpose |
|------|---------|
| `migration-001-rbac-delete-restore-permissions.sql` | Removes delete/restore from non-Super Admin roles, adds missing permissions |
| `migration-002-auto-assign-trigger-and-guards.sql` | Creates the auto-assign trigger + unique constraint |

---

## Quick Reference: API Endpoints and Required Permissions

### Users
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/v1/users` | `user.read` |
| GET | `/api/v1/users/:id` | `user.read` |
| POST | `/api/v1/users` | `user.create` |
| PUT | `/api/v1/users/:id` | `user.update` |
| DELETE | `/api/v1/users/:id` | `user.delete` (Super Admin only) |
| PATCH | `/api/v1/users/:id/restore` | `user.restore` (Super Admin only) |

### Roles
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/v1/roles` | `role.read` |
| POST | `/api/v1/roles` | `role.create` |
| PUT | `/api/v1/roles/:id` | `role.update` |
| DELETE | `/api/v1/roles/:id` | `role.delete` (Super Admin only) |
| PATCH | `/api/v1/roles/:id/restore` | `role.restore` (Super Admin only) |

### Modules
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/v1/modules` | `module.read` |
| POST | `/api/v1/modules` | `module.create` |
| PUT | `/api/v1/modules/:id` | `module.update` |
| DELETE | `/api/v1/modules/:id` | `module.delete` (Super Admin only) |
| PATCH | `/api/v1/modules/:id/restore` | `module.restore` (Super Admin only) |

### Auth (No permissions needed — public or self-authenticated)
| Method | Endpoint | Auth Required |
|--------|----------|---------------|
| POST | `/api/v1/auth/register/initiate` | No |
| POST | `/api/v1/auth/register/verify-otp` | No |
| POST | `/api/v1/auth/login` | No |
| POST | `/api/v1/auth/refresh` | No |
| POST | `/api/v1/auth/logout` | Yes (Bearer token) |
| POST | `/api/v1/auth/forgot-password/initiate` | No |
| POST | `/api/v1/auth/change-password/initiate` | Yes |
| POST | `/api/v1/auth/change-email/initiate` | Yes |
| POST | `/api/v1/auth/change-mobile/initiate` | Yes |
