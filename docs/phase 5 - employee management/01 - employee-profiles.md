# Phase 5 — Employee Profiles

An employee profile is the 1:1 detail record for a `users` row (when that user is an employee). It stores employment data (employee code, designation, department, branch, joining date, employment type), compensation info (salary, CTC, pay grade, payment mode, taxation), leave balances, system access flags, asset assignments, experience summary, notice period, resignation/exit data, and shift/location assignments.

This resource enforces role-based access patterns: **super-admins** have full CRUD; **admins** have create/read/update but not delete; **students and instructors** have no direct access (this is admin/SA only). The `/me` endpoint pattern from Phase 4 is not used here since employees are provisioned by administrators.

All routes require auth. Permission codes: `employee_profile.create`, `employee_profile.read`, `employee_profile.update`, `employee_profile.delete`, `employee_profile.read.own`, `employee_profile.update.own`.

- Super-admin: all 6 permissions.
- Admin: `create`, `read`, `update`, `read.own`, `update.own` (no `delete`).
- Student/Instructor: none (endpoint returns 403 for these roles).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1employee-profiles) | `GET` | `{{baseUrl}}/api/v1/employee-profiles` | `employee_profile.read` | List all profiles (admin+ only). |
| [§1.2](#12-get-apiv1employee-profilesid) | `GET` | `{{baseUrl}}/api/v1/employee-profiles/:id` | `employee_profile.read` *or* `employee_profile.read.own` (+ self match) | Get one profile by ID. |
| [§1.3](#13-post-apiv1employee-profiles) | `POST` | `{{baseUrl}}/api/v1/employee-profiles` | `employee_profile.create` | Admin create — full body. |
| [§1.4](#14-patch-apiv1employee-profilesid) | `PATCH` | `{{baseUrl}}/api/v1/employee-profiles/:id` | `employee_profile.update` *or* `employee_profile.update.own` (+ self match) | Update one profile by ID. |
| [§1.5](#15-delete-apiv1employee-profilesid) | `DELETE` | `{{baseUrl}}/api/v1/employee-profiles/:id` | `employee_profile.delete` + super-admin role | Hard-delete one profile (SA only). |
| [§1.6](#16-get-apiv1employee-profilesme) | `GET` | `{{baseUrl}}/api/v1/employee-profiles/me` | `employee_profile.read.own` | Get own employee profile. |
| [§1.7](#17-patch-apiv1employee-profilesme) | `PATCH` | `{{baseUrl}}/api/v1/employee-profiles/me` | `employee_profile.update.own` | Update own employee profile (salary + exit fields restricted to admins). |

> `/me` endpoints must be declared before `/:id` in the router so Express does not treat `me` as an id segment.

---

## 1.1 `GET /api/v1/employee-profiles`

List employee profiles. Backed by `udf_get_employee_profiles`, which joins `employee_profiles` → `uv_users` → `designations`, `departments`, `branches` (and reporting manager user). Supports full pagination, multi-table sorting, filtering by dozens of fields, and full-text search.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/employee-profiles` |
| Permission | `employee_profile.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across employee code, first name, last name, email, designation name, department name, branch name. |
| `sortTable` | enum | `emp` | `emp` \| `designation` \| `department` \| `branch` \| `user`. Determines which table's column sorting applies. |
| `sortColumn` | enum | `id` | See [sort columns per table](#sort-columns-per-table) below. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `filterEmployeeType` | enum | — | `full_time`, `part_time`, `contract`, `probation`, `intern`, `consultant`, `temporary`, `freelance`. |
| `filterWorkMode` | enum | — | `on_site`, `remote`, `hybrid`. |
| `filterShiftType` | enum | — | `general`, `morning`, `afternoon`, `night`, `rotational`, `flexible`, `other`. |
| `filterPayGrade` | string | — | Contains match (case-insensitive). |
| `filterTaxRegime` | enum | — | `old`, `new`. |
| `filterExitType` | enum | — | `resignation`, `termination`, `retirement`, `contract_end`, `absconding`, `mutual_separation`, `other`. |
| `filterPaymentMode` | enum | — | `bank_transfer`, `cheque`, `cash`, `upi`, `other`. |
| `filterHasSystemAccess` | bool | — | Filter by `hasSystemAccess` flag. |
| `filterHasVpnAccess` | bool | — | Filter by `hasVpnAccess` flag. |
| `filterIsActive` | bool | — | Filter by employment status. |
| `filterIsDeleted` | bool | — | Include/exclude soft-deleted profiles. |
| `filterDesignationId` | int | — | Filter by designation. |
| `filterDepartmentId` | int | — | Filter by department. |
| `filterBranchId` | int | — | Filter by branch. |
| `filterReportingManagerId` | int | — | Filter by reporting manager user ID. |
| `filterUserRole` | string | — | Filter by parent user's role code, e.g. `employee`. |
| `filterUserIsActive` | bool | — | Filter by inherited user active flag. |

### Sort columns per table

- **`emp`** (employee_profiles): `id`, `employee_code`, `employee_type`, `joining_date`, `work_mode`, `shift_type`, `pay_grade`, `ctc_annual`, `total_experience_years`, `notice_period_days`, `is_active`, `created_at`, `updated_at`.
- **`designation`**: `name`, `level`, `level_band`.
- **`department`**: `name`, `code`.
- **`branch`**: `name`, `code`.
- **`user`**: `first_name`, `last_name`, `email`, `role`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "userId": 2,
      "employeeCode": "EMP001",
      "designationId": 1,
      "designationName": "Senior Software Engineer",
      "designationLevel": 4,
      "designationLevelBand": "IC-4",
      "departmentId": 1,
      "departmentName": "Engineering",
      "departmentCode": "ENG",
      "branchId": 1,
      "branchName": "Mumbai HQ",
      "branchCode": "MUM",
      "joiningDate": "2022-03-15",
      "confirmationDate": "2022-09-15",
      "employeeType": "full_time",
      "reportingManagerId": 1,
      "reportingManagerName": "Super Admin",
      "probationEndDate": "2022-09-15",
      "contractEndDate": null,
      "workMode": "hybrid",
      "shiftType": "general",
      "shiftBranchId": 1,
      "workLocation": "Mumbai Office, Building A, Floor 3",
      "weeklyOffDays": "Saturday,Sunday",
      "payGrade": "Grade-5",
      "salaryCurrency": "INR",
      "ctcAnnual": 1200000,
      "basicSalaryMonthly": 75000,
      "paymentMode": "bank_transfer",
      "pfNumber": "PF/2022/00001",
      "esiNumber": null,
      "uanNumber": "100123456789",
      "professionalTaxNumber": "PT/2022/123",
      "taxRegime": "new",
      "leaveBalanceCasual": 12,
      "leaveBalanceSick": 10,
      "leaveBalanceEarned": 20,
      "leaveBalanceCompensatory": 5,
      "totalExperienceYears": 8,
      "experienceAtJoining": 5,
      "hasSystemAccess": true,
      "hasEmailAccess": true,
      "hasVpnAccess": true,
      "accessCardNumber": "ACC-EMP001",
      "laptopAssetId": "ASSET-12345",
      "noticePeriodDays": 30,
      "isActive": true,
      "resignationDate": null,
      "lastWorkingDate": null,
      "relievingDate": null,
      "exitType": null,
      "exitReason": null,
      "exitInterviewDone": false,
      "fullAndFinalDone": false,
      "createdBy": 1,
      "updatedBy": 1,
      "createdAt": "2022-03-15T10:30:00.000Z",
      "updatedAt": "2026-04-11T14:22:00.000Z",
      "isDeleted": false,
      "userIsActive": true,
      "user": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@growupmore.com",
        "mobile": "+91-9876543210",
        "roleId": 2,
        "roleName": "Employee",
        "isActive": true,
        "isDeleted": false,
        "isEmailVerified": true,
        "isMobileVerified": true
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 125, "totalPages": 7 }
}
```

#### 403 Forbidden — caller lacks `employee_profile.read`

```json
{
  "success": false,
  "message": "Missing required permission: employee_profile.read",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor role

```json
{
  "success": false,
  "message": "Only admins and super-admins may access employee profiles",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/employee-profiles` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across code/name/email/designation | `?searchTerm=EMP001` |
| Search employee by name | `?searchTerm=john` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=mumbai` |
| Employee type — full_time | `?filterEmployeeType=full_time` |
| Employee type — contract | `?filterEmployeeType=contract` |
| Employee type — intern | `?filterEmployeeType=intern` |
| Work mode — on_site | `?filterWorkMode=on_site` |
| Work mode — remote | `?filterWorkMode=remote` |
| Work mode — hybrid | `?filterWorkMode=hybrid` |
| Shift type — morning | `?filterShiftType=morning` |
| Shift type — night | `?filterShiftType=night` |
| Shift type — rotational | `?filterShiftType=rotational` |
| Pay grade filter | `?filterPayGrade=Grade-5` |
| Tax regime — old | `?filterTaxRegime=old` |
| Tax regime — new | `?filterTaxRegime=new` |
| Exit type — resignation | `?filterExitType=resignation` |
| Exit type — termination | `?filterExitType=termination` |
| Exit type — retirement | `?filterExitType=retirement` |
| Payment mode — bank_transfer | `?filterPaymentMode=bank_transfer` |
| Payment mode — cheque | `?filterPaymentMode=cheque` |
| Payment mode — upi | `?filterPaymentMode=upi` |
| Has system access | `?filterHasSystemAccess=true` |
| No system access | `?filterHasSystemAccess=false` |
| Has VPN access | `?filterHasVpnAccess=true` |
| Active employees only | `?filterIsActive=true` |
| Inactive employees only | `?filterIsActive=false` |
| Exclude soft-deleted | `?filterIsDeleted=false` |
| Include soft-deleted (admin audit) | `?filterIsDeleted=true` |
| Filter by designation | `?filterDesignationId=1` |
| Filter by department | `?filterDepartmentId=1` |
| Filter by branch | `?filterBranchId=1` |
| Filter by reporting manager | `?filterReportingManagerId=1` |
| Filter by user role | `?filterUserRole=employee` |
| Active user only | `?filterUserIsActive=true` |
| Sort by `id` ASC (default) | `?sortTable=emp&sortColumn=id&sortDirection=ASC` |
| Sort by `id` DESC | `?sortTable=emp&sortColumn=id&sortDirection=DESC` |
| Sort by employee code ASC | `?sortTable=emp&sortColumn=employee_code&sortDirection=ASC` |
| Sort by joining date DESC (newest first) | `?sortTable=emp&sortColumn=joining_date&sortDirection=DESC` |
| Sort by CTC ASC (lowest first) | `?sortTable=emp&sortColumn=ctc_annual&sortDirection=ASC` |
| Sort by CTC DESC (highest first) | `?sortTable=emp&sortColumn=ctc_annual&sortDirection=DESC` |
| Sort by experience DESC | `?sortTable=emp&sortColumn=total_experience_years&sortDirection=DESC` |
| Sort by is_active DESC | `?sortTable=emp&sortColumn=is_active&sortDirection=DESC` |
| Sort by created_at DESC (newest first) | `?sortTable=emp&sortColumn=created_at&sortDirection=DESC` |
| Sort by designation name ASC | `?sortTable=designation&sortColumn=name&sortDirection=ASC` |
| Sort by designation level DESC | `?sortTable=designation&sortColumn=level&sortDirection=DESC` |
| Sort by department name ASC | `?sortTable=department&sortColumn=name&sortDirection=ASC` |
| Sort by branch name ASC | `?sortTable=branch&sortColumn=name&sortDirection=ASC` |
| Sort by user first_name ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort by user email ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Combo — full-time, Mumbai branch, sorted by CTC DESC | `?pageIndex=1&pageSize=20&filterEmployeeType=full_time&filterBranchId=1&sortTable=emp&sortColumn=ctc_annual&sortDirection=DESC` |
| Combo — active, hybrid work, sorted by joining date | `?pageIndex=1&pageSize=50&filterIsActive=true&filterWorkMode=hybrid&sortTable=emp&sortColumn=joining_date&sortDirection=DESC` |
| Combo — department filter, search, sorted by name | `?pageIndex=1&pageSize=20&filterDepartmentId=1&searchTerm=engineer&sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Combo — inactive + system access false | `?pageIndex=1&pageSize=20&filterIsActive=false&filterHasSystemAccess=false` |
| Combo — contract type, exit type termination | `?pageIndex=1&pageSize=20&filterEmployeeType=contract&filterExitType=termination` |

---

## 1.2 `GET /api/v1/employee-profiles/:id`

Get one profile by ID. Uses `authorizeSelfOr` — if the caller holds `employee_profile.read` they pass unconditionally; otherwise the middleware resolves the owner of `:id` and allows the call only when the owner is the caller.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/employee-profiles/:id` |
| Permission | `employee_profile.read` *or* `employee_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full `EmployeeProfileDto` in `data`.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "userId": 2,
    "employeeCode": "EMP001",
    "designationId": 1,
    "designationName": "Senior Software Engineer",
    "designationLevel": 4,
    "designationLevelBand": "IC-4",
    "departmentId": 1,
    "departmentName": "Engineering",
    "departmentCode": "ENG",
    "branchId": 1,
    "branchName": "Mumbai HQ",
    "branchCode": "MUM",
    "joiningDate": "2022-03-15",
    "confirmationDate": "2022-09-15",
    "employeeType": "full_time",
    "reportingManagerId": 1,
    "reportingManagerName": "Super Admin",
    "probationEndDate": "2022-09-15",
    "contractEndDate": null,
    "workMode": "hybrid",
    "shiftType": "general",
    "shiftBranchId": 1,
    "workLocation": "Mumbai Office, Building A, Floor 3",
    "weeklyOffDays": "Saturday,Sunday",
    "payGrade": "Grade-5",
    "salaryCurrency": "INR",
    "ctcAnnual": 1200000,
    "basicSalaryMonthly": 75000,
    "paymentMode": "bank_transfer",
    "pfNumber": "PF/2022/00001",
    "esiNumber": null,
    "uanNumber": "100123456789",
    "professionalTaxNumber": "PT/2022/123",
    "taxRegime": "new",
    "leaveBalanceCasual": 12,
    "leaveBalanceSick": 10,
    "leaveBalanceEarned": 20,
    "leaveBalanceCompensatory": 5,
    "totalExperienceYears": 8,
    "experienceAtJoining": 5,
    "hasSystemAccess": true,
    "hasEmailAccess": true,
    "hasVpnAccess": true,
    "accessCardNumber": "ACC-EMP001",
    "laptopAssetId": "ASSET-12345",
    "noticePeriodDays": 30,
    "isActive": true,
    "resignationDate": null,
    "lastWorkingDate": null,
    "relievingDate": null,
    "exitType": null,
    "exitReason": null,
    "exitInterviewDone": false,
    "fullAndFinalDone": false,
    "createdBy": 1,
    "updatedBy": 1,
    "createdAt": "2022-03-15T10:30:00.000Z",
    "updatedAt": "2026-04-11T14:22:00.000Z",
    "isDeleted": false,
    "userIsActive": true,
    "user": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@growupmore.com",
      "mobile": "+91-9876543210",
      "roleId": 2,
      "roleName": "Employee",
      "isActive": true,
      "isDeleted": false,
      "isEmailVerified": true,
      "isMobileVerified": true
    }
  }
}
```

#### 403 Forbidden — own-scope caller, someone else's profile

```json
{
  "success": false,
  "message": "Forbidden: employee_profile.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor role

```json
{
  "success": false,
  "message": "Only admins and super-admins may access employee profiles",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Employee profile 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.3 `POST /api/v1/employee-profiles`

Admin create — full field access. Requires `employee_profile.create`, which is held by super-admin and admin. Parent user must exist and be active.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/employee-profiles` |
| Permission | `employee_profile.create` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Required fields in request body:**
- `userId` (int) — Must exist in `users` table.
- `employeeCode` (string) — Unique identifier across all employees.
- `designationId` (int) — Must exist in `designations` table.
- `departmentId` (int) — Must exist in `departments` table.
- `branchId` (int) — Must exist in `branches` table.
- `joiningDate` (date, ISO 8601) — Joining date.

**Optional fields** (all others):

```json
{
  "userId": 5,
  "employeeCode": "EMP042",
  "designationId": 2,
  "departmentId": 2,
  "branchId": 2,
  "joiningDate": "2024-01-10",
  "confirmationDate": "2024-07-10",
  "employeeType": "full_time",
  "reportingManagerId": 1,
  "probationEndDate": "2024-07-10",
  "contractEndDate": null,
  "workMode": "on_site",
  "shiftType": "general",
  "shiftBranchId": 2,
  "workLocation": "Bangalore Office",
  "weeklyOffDays": "Saturday,Sunday",
  "payGrade": "Grade-4",
  "salaryCurrency": "INR",
  "ctcAnnual": 950000,
  "basicSalaryMonthly": 60000,
  "paymentMode": "bank_transfer",
  "pfNumber": "PF/2024/00042",
  "esiNumber": null,
  "uanNumber": "100123456790",
  "professionalTaxNumber": "PT/2024/042",
  "taxRegime": "new",
  "leaveBalanceCasual": 12,
  "leaveBalanceSick": 10,
  "leaveBalanceEarned": 20,
  "leaveBalanceCompensatory": 0,
  "totalExperienceYears": 6,
  "experienceAtJoining": 3,
  "hasSystemAccess": true,
  "hasEmailAccess": true,
  "hasVpnAccess": false,
  "accessCardNumber": "ACC-EMP042",
  "laptopAssetId": "ASSET-54321",
  "noticePeriodDays": 30,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Employee profile created",
  "data": { /* full EmployeeProfileDto */ }
}
```

#### 400 Bad request — parent user does not exist or is deleted

```json
{
  "success": false,
  "message": "Error inserting employee profile: User id 99999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — invalid designation/department/branch

```json
{
  "success": false,
  "message": "Error inserting employee profile: Designation id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — employee code already exists

```json
{
  "success": false,
  "message": "Error inserting employee profile: Employee code EMP042 already exists.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — admin caller (no create permission)

```json
{
  "success": false,
  "message": "Missing required permission: employee_profile.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/employee-profiles/:id`

Partial update. `authorizeSelfOr` lets admins use this on any row and lets employees use it on their own row (with field restrictions). Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/employee-profiles/:id` |
| Permission | `employee_profile.update` *or* `employee_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body** — any subset of fields. **Admin-only fields** (403 if employee attempts): `ctcAnnual`, `basicSalaryMonthly`, `paymentMode`, `pfNumber`, `esiNumber`, `uanNumber`, `professionalTaxNumber`, `taxRegime`, `resignationDate`, `lastWorkingDate`, `relievingDate`, `exitType`, `exitReason`, `exitInterviewDone`, `fullAndFinalDone`. Example:

```json
{
  "workLocation": "Mumbai Office, Building B",
  "payGrade": "Grade-5",
  "leaveBalanceCasual": 10,
  "leaveBalanceSick": 8
}
```

Example (admin update of exit fields):

```json
{
  "isActive": false,
  "resignationDate": "2026-04-01",
  "lastWorkingDate": "2026-05-31",
  "relievingDate": "2026-05-31",
  "exitType": "resignation",
  "exitReason": "Career advancement",
  "exitInterviewDone": true,
  "fullAndFinalDone": false
}
```

### Responses

#### 200 OK

Full updated `EmployeeProfileDto` in `data`.

#### 403 Forbidden — own-scope caller on a foreign row

```json
{
  "success": false,
  "message": "Forbidden: employee_profile.update.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — employee attempting admin-only field

```json
{
  "success": false,
  "message": "Forbidden: Field 'ctcAnnual' is admin-only",
  "code": "FORBIDDEN"
}
```

#### 400 Bad request — empty body

```json
{
  "success": false,
  "message": "Validation error: At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad request — foreign key validation

```json
{
  "success": false,
  "message": "Error updating employee profile: Designation id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 1.5 `DELETE /api/v1/employee-profiles/:id`

Hard-delete a profile row. Does **not** touch the parent `users` row.

This endpoint is super-admin-only. Admins have `employee_profile.update` and can clear individual fields with `PATCH /:id`, but they cannot hard-delete the row. To additionally enforce this even if a future seed accidentally granted `employee_profile.delete` to admin, the router layers a `requireSuperAdmin` role check on top of the permission check.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/employee-profiles/:id` |
| Permission | `employee_profile.delete` + role `super_admin` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Employee profile deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — admin caller

```json
{
  "success": false,
  "message": "Only super admins may hard-delete employee profiles",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor

```json
{
  "success": false,
  "message": "Only admins and super-admins may access employee profiles",
  "code": "FORBIDDEN"
}
```

#### 400 Bad request — unknown id

```json
{
  "success": false,
  "message": "Error deleting employee profile: No employee profile found with id 99999.",
  "code": "BAD_REQUEST"
}
```

---

## 1.6 `GET /api/v1/employee-profiles/me`

Return the caller's own employee profile. This is the self-service read path for employees; admins can use it too but typically hit `/:id` instead.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/employee-profiles/me` |
| Permission | `employee_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full `EmployeeProfileDto` in `data`.

```json
{
  "success": true,
  "message": "OK",
  "data": { /* full EmployeeProfileDto */ }
}
```

#### 404 Not Found — caller has no employee profile yet

```json
{
  "success": false,
  "message": "You do not have an employee profile yet. Contact your administrator.",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — student/instructor role

```json
{
  "success": false,
  "message": "Only employees may access their own profile",
  "code": "FORBIDDEN"
}
```

---

## 1.7 `PATCH /api/v1/employee-profiles/me`

Self-service partial update. Employees can only update their own non-sensitive fields; salary, tax, and exit fields are admin-only. Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/employee-profiles/me` |
| Permission | `employee_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Allowed fields for self-service:**
`workLocation`, `weeklyOffDays`, `leaveBalanceCasual`, `leaveBalanceSick`, `leaveBalanceEarned`, `leaveBalanceCompensatory`, `hasSystemAccess`, `hasEmailAccess`, `hasVpnAccess`, `accessCardNumber`, `laptopAssetId`, `noticePeriodDays` (and readOnly tracking fields do not apply).

**Forbidden fields** (attempt triggers 403): `ctcAnnual`, `basicSalaryMonthly`, `paymentMode`, `pfNumber`, `esiNumber`, `uanNumber`, `professionalTaxNumber`, `taxRegime`, `resignationDate`, `lastWorkingDate`, `relievingDate`, `exitType`, `exitReason`, `exitInterviewDone`, `fullAndFinalDone`.

Example:

```json
{
  "workLocation": "Remote for 2 weeks, then back to office",
  "leaveBalanceCasual": 9
}
```

### Responses

#### 200 OK

Full updated `EmployeeProfileDto` in `data`.

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error: At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden — attempt to update admin-only field

```json
{
  "success": false,
  "message": "Forbidden: Field 'ctcAnnual' is admin-only",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor role

```json
{
  "success": false,
  "message": "Only employees may update their own profile",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found — caller has no employee profile

```json
{
  "success": false,
  "message": "You do not have an employee profile yet. Contact your administrator.",
  "code": "NOT_FOUND"
}
```

---

## DTO reference

`EmployeeProfileDto` is the standard response envelope for employee profiles. The full TypeScript definition lives in [`api/src/modules/employee-profiles/employee-profiles.service.ts`](../../../api/src/modules/employee-profiles/employee-profiles.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId` | Primary keys — profile id and owning user id (1:1). |
| `employeeCode` | Unique employee identifier string. |
| `designationId`, `designationName`, `designationLevel`, `designationLevelBand` | Designation reference and resolved info. |
| `departmentId`, `departmentName`, `departmentCode` | Department reference and resolved info. |
| `branchId`, `branchName`, `branchCode` | Branch reference and resolved info. |
| `joiningDate`, `confirmationDate`, `probationEndDate`, `contractEndDate` | Employment lifecycle dates. |
| `employeeType` | Enum: `full_time`, `part_time`, `contract`, `probation`, `intern`, `consultant`, `temporary`, `freelance`. |
| `reportingManagerId`, `reportingManagerName` | Direct manager reference. |
| `workMode` | Enum: `on_site`, `remote`, `hybrid`. |
| `shiftType` | Enum: `general`, `morning`, `afternoon`, `night`, `rotational`, `flexible`, `other`. |
| `shiftBranchId`, `workLocation`, `weeklyOffDays` | Location and schedule info. |
| `payGrade`, `salaryCurrency`, `ctcAnnual`, `basicSalaryMonthly` | Compensation summary. |
| `paymentMode` | Enum: `bank_transfer`, `cheque`, `cash`, `upi`, `other`. |
| `pfNumber`, `esiNumber`, `uanNumber`, `professionalTaxNumber` | Statutory compliance IDs. |
| `taxRegime` | Enum: `old`, `new`. |
| `leaveBalanceCasual`, `leaveBalanceSick`, `leaveBalanceEarned`, `leaveBalanceCompensatory` | Leave accrual tracking. |
| `totalExperienceYears`, `experienceAtJoining` | Experience summary. |
| `hasSystemAccess`, `hasEmailAccess`, `hasVpnAccess` | System access flags. |
| `accessCardNumber`, `laptopAssetId` | Asset assignments. |
| `noticePeriodDays` | Contractual notice period. |
| `isActive` | Employment status flag. |
| `resignationDate`, `lastWorkingDate`, `relievingDate`, `exitType`, `exitReason` | Exit tracking. |
| `exitInterviewDone`, `fullAndFinalDone` | Exit process completion flags. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `isDeleted` | Soft-delete flag. |
| `userIsActive` | Inherited active status from parent users row. |
| `user` | Nested owner summary (name, email, role, mobile, verification flags). |

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)
