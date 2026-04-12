# Phase 3 — Walkthrough and Index

End-to-end walkthrough for the three phase-3 resources — from logging in as Super Admin through creating a branch under the phase-2 geography chain, building a department tree, and gluing them together with a `branch_departments` junction row. Closes with the auto-seed permission check and the standalone verify script.

All requests on this page reference the two Postman environment variables established in [00 §7](00%20-%20overview.md#7-postman-environment):

| Variable | Purpose |
|---|---|
| `{{baseUrl}}` | API origin — `http://localhost:3000` locally, `https://api.growupmore.com` in prod. |
| `{{accessToken}}` | Super Admin JWT, minted once per session via `POST {{baseUrl}}/api/v1/auth/login`. |

Every request below sends `Authorization: Bearer {{accessToken}}` and, where a body is present, `Content-Type: application/json`. The walkthrough is a sequenced pointer at the per-endpoint Postman blocks in [01 branches](01%20-%20branches.md), [02 departments](02%20-%20departments.md), and [03 branch-departments](03%20-%20branch-departments.md) — follow each link for the full set of responses (2xx happy path plus every 4xx / 5xx the route can emit).

← [03 branch-departments](03%20-%20branch-departments.md) · [Phase 2 walkthrough](../phase%202%20-%20master%20data%20management/06%20-%20walkthrough%20and%20index.md)

---

## 1. Prerequisites

- API running locally at `http://localhost:3000` (see repo `README.md`).
- Phase 1 seed data applied — the Super Admin user exists and has a password.
- Phase 2 geography chain populated — at least one country / state / city you can point a branch at. The phase-2 walkthrough's India → Maharashtra → Mumbai path (see [phase 2 §2](../phase%202%20-%20master%20data%20management/06%20-%20walkthrough%20and%20index.md#2-the-happy-path--india--maharashtra--mumbai)) is enough.
- Phase 3 permission seed applied — `phase-03-branch-management/04_seed_permissions.sql` has been run, which calls `udf_auto_create_resource_permissions` three times (`branch`, `department`, `branch_department`) for **15 permission rows**.
- A Postman environment with `baseUrl` set and an `accessToken` minted via the login request documented in [00 §7](00%20-%20overview.md#7-postman-environment).

---

## 2. The happy path — HQ branch + department tree + assignment

The walkthrough below assumes you already have a Mumbai city id (from phase 2) and the standard India → Maharashtra chain. Substitute your own ids — every numeric reference below corresponds to a variable you'd set in Postman or a row you'd read from a previous response.

### Step 1 — Create a branch under Mumbai

- **Endpoint:** `POST {{baseUrl}}/api/v1/branches` → see [01 §1.3](01%20-%20branches.md#13-post-apiv1branches) for the full request / response matrix.
- **Permission:** `branch.create`
- **Body** (pass `isActive: true` explicitly — see §3):

```json
{
  "countryId": 1,
  "stateId": 12,
  "cityId": 85,
  "name": "Mumbai HQ",
  "code": "MUM-HQ",
  "branchType": "headquarters",
  "addressLine1": "Level 10, One BKC",
  "addressLine2": "Bandra Kurla Complex",
  "pincode": "400051",
  "phone": "+91-22-4000-0000",
  "email": "mumbai@growupmore.com",
  "website": "https://growupmore.com",
  "timezone": "Asia/Kolkata",
  "isActive": true
}
```

A `201 CREATED` response echoes the full tree — branch → nested city → nested state → nested country — so you can render "Mumbai HQ, Mumbai, Maharashtra, India" from a single call. Capture `data.id` as `branchId` in your Postman environment (a Postman "Tests" script of the shape `pm.environment.set("branchId", pm.response.json().data.id)` does the job).

### Step 2 — Build the department tree

**Top-level department first:**

- **Endpoint:** `POST {{baseUrl}}/api/v1/departments` → see [02 §2.3](02%20-%20departments.md#23-post-apiv1departments).
- **Permission:** `department.create`
- **Body:**

```json
{
  "name": "Technology",
  "code": "TECH",
  "description": "Engineering organization.",
  "isActive": true
}
```

Capture `data.id` as `techDepartmentId`.

**Then a child under Technology:**

```json
{
  "name": "Frontend Development",
  "code": "TECH-FE",
  "description": "Web and mobile UI engineering.",
  "parentDepartmentId": {{techDepartmentId}},
  "isActive": true
}
```

Capture `data.id` as `frontendDepartmentId`.

**Inspecting the tree:**

| What you want | Request | Doc |
|---|---|---|
| Every child under Technology | `GET {{baseUrl}}/api/v1/departments?parentDepartmentId={{techDepartmentId}}` | [02 §2.1](02%20-%20departments.md#21-get-apiv1departments) |
| Just the root-level departments | `GET {{baseUrl}}/api/v1/departments?topLevelOnly=true` | [02 §2.1](02%20-%20departments.md#21-get-apiv1departments) |
| A single department with its parent block | `GET {{baseUrl}}/api/v1/departments/{{frontendDepartmentId}}` | [02 §2.2](02%20-%20departments.md#22-get-apiv1departmentsid) |

### Step 3 — Assign the department to the branch

- **Endpoint:** `POST {{baseUrl}}/api/v1/branch-departments` → see [03 §3.3](03%20-%20branch-departments.md#33-post-apiv1branch-departments).
- **Permission:** `branch_department.create`
- **Body:**

```json
{
  "branchId": {{branchId}},
  "departmentId": {{frontendDepartmentId}},
  "employeeCapacity": 80,
  "floorOrWing": "Level 9, East Wing",
  "extensionNumber": "1234",
  "isActive": true
}
```

The `201 CREATED` row comes back with nested `branch`, `department`, and a flattened `location` block carrying just the three names — enough to render "Frontend Development @ Mumbai HQ (Mumbai, Maharashtra, India)" without another round-trip. Capture `data.id` as `branchDepartmentId`.

### Step 4 — Drill back down

| What you want | Request | Doc |
|---|---|---|
| Every department hosted by Mumbai HQ | `GET {{baseUrl}}/api/v1/branch-departments?branchId={{branchId}}&pageSize=50` | [03 §3.1](03%20-%20branch-departments.md#31-get-apiv1branch-departments) |
| Every branch that hosts Frontend Development | `GET {{baseUrl}}/api/v1/branch-departments?departmentId={{frontendDepartmentId}}` | [03 §3.1](03%20-%20branch-departments.md#31-get-apiv1branch-departments) |
| The junction row itself, with full nested metadata | `GET {{baseUrl}}/api/v1/branch-departments/{{branchDepartmentId}}` | [03 §3.2](03%20-%20branch-departments.md#32-get-apiv1branch-departmentsid) |

---

## 3. The three sharp edges you'll hit

Three phase-3 behaviours routinely surprise callers who are fluent in phase-1 / phase-2 but new to the branch-management graph. They're all deliberate.

**`isActive` defaults to `false` on create.** All three POST routes default to inactive when the body omits `isActive`. The UDFs reject activating a branch under an inactive country/state/city, a child department under an inactive parent, or a junction row under an inactive branch or department — so any default of `true` would turn every create path into a potential `400 BAD_REQUEST` the first time a parent happened to be inactive. Pass `isActive: true` explicitly when you want the row live immediately. See [§6 in 00-overview](00%20-%20overview.md#6-active-flag-defaults).

**`clearParent` (departments) and `clearLocalHead` (branch-departments).** Zod refuses `{ "parentDepartmentId": null }` and `{ "localHeadUserId": null }`. Pass `{ "clearParent": true }` or `{ "clearLocalHead": true }` instead. This mirrors the phase-2 `categoryId` re-parent on sub-categories and makes "field omitted" vs "explicitly set to null" unambiguous on the wire. Both are documented in detail in [02 §2.4](02%20-%20departments.md#24-patch-apiv1departmentsid) and [03 §3.4](03%20-%20branch-departments.md#34-patch-apiv1branch-departmentsid).

**`branch_departments.branch_id` and `branch_departments.department_id` are immutable on PATCH.** The update UDF does not accept `p_branch_id` or `p_department_id` at all, and the zod schema follows suit. To "move" a department from one branch to another, soft-delete the existing junction row and POST a fresh one. See [03 §3.4](03%20-%20branch-departments.md#34-patch-apiv1branch-departmentsid) for the exact error emitted if you try.

---

## 4. The delete guards — both sides of the junction protect themselves

Phase 3 adds three symmetric "active child mapping blocks the delete" rules you should be aware of before wiring a UI:

1. **Delete a branch** → if any `branch_departments` row for that branch is still `is_deleted = FALSE`, the UDF returns `403 FORBIDDEN — Cannot delete branch: it still has active department assignments. Remove or soft-delete those first.`
2. **Delete a department** → two guards. Active sub-departments block first (`Cannot delete department: it still has active sub-departments.`), then active branch assignments (`Cannot delete department: it is still assigned to one or more active branches.`).
3. **Delete a branch-department** → always allowed (leaf resource).

So the only always-safe deletion order is **bottom-up**: junctions first, then the leaves of the department tree, then the branch, then the department roots.

| # | Request | Doc |
|---|---|---|
| 1 | `DELETE {{baseUrl}}/api/v1/branch-departments/{{branchDepartmentId}}` | [03 §3.5](03%20-%20branch-departments.md#35-delete-apiv1branch-departmentsid) |
| 2 | `DELETE {{baseUrl}}/api/v1/departments/{{frontendDepartmentId}}` | [02 §2.5](02%20-%20departments.md#25-delete-apiv1departmentsid) |
| 3 | `DELETE {{baseUrl}}/api/v1/departments/{{techDepartmentId}}` | [02 §2.5](02%20-%20departments.md#25-delete-apiv1departmentsid) |
| 4 | `DELETE {{baseUrl}}/api/v1/branches/{{branchId}}` | [01 §1.5](01%20-%20branches.md#15-delete-apiv1branchesid) |

Each of these returns the standard `{ success, message, data: { id, deleted: true } }` envelope; the follow-up `POST /:id/restore` calls bring everything back in reverse order.

**Restore gates differ across the three resources** — summarised here so you don't have to cross-reference the per-resource docs:

| Resource | On restore, `is_active` becomes | Rejected if |
|---|---|---|
| Branch | `TRUE` always | Any of `country_id` / `state_id` / `city_id` is currently inactive, deleted, or no longer linked to its parent. |
| Department | `TRUE` always | Non-NULL `parent_department_id` points at a parent that is deleted or inactive. Top-level (parent NULL) always restores. |
| Branch-department | Conditional: `TRUE` if **both** parents are alive and active, otherwise `FALSE` | A different non-deleted row already exists for the same `(branchId, departmentId)` pair. |

See [01 §1.6](01%20-%20branches.md#16-post-apiv1branchesidrestore), [02 §2.6](02%20-%20departments.md#26-post-apiv1departmentsidrestore), and [03 §3.6](03%20-%20branch-departments.md#36-post-apiv1branch-departmentsidrestore) for the exact error messages and the full response envelopes (including the dual `200 OK` the branch-department restore emits).

---

## 5. Verifying the permission auto-seed

Phase 3 does **not** add a new permissions catalogue file by hand — the seed script calls `udf_auto_create_resource_permissions` three times with `p_include_own=FALSE`, producing **15 permission rows**. You can confirm the result in three ways.

### 5a. Check the catalogue

| What | Request | Expectation |
|---|---|---|
| All `branch.*` permissions | `GET {{baseUrl}}/api/v1/permissions?searchTerm=branch.&pageSize=50` | 5 rows — `read`, `create`, `update`, `delete`, `restore` |
| All `department.*` permissions | `GET {{baseUrl}}/api/v1/permissions?searchTerm=department.&pageSize=50` | 5 rows — `read`, `create`, `update`, `delete`, `restore` |
| All `branch_department.*` permissions | `GET {{baseUrl}}/api/v1/permissions?searchTerm=branch_department.&pageSize=50` | 5 rows — `read`, `create`, `update`, `delete`, `restore` |

The third query uses the **snake_case** resource code `branch_department`, not the kebab-case URL — see [§1 in 00-overview](00%20-%20overview.md#1-the-three-resources) for the reason.

### 5b. Super Admin has all of them

| Request | Expectation |
|---|---|
| `GET {{baseUrl}}/api/v1/role-permissions?roleName=super_admin&resource=branch` | 5 rows |
| `GET {{baseUrl}}/api/v1/role-permissions?roleName=super_admin&resource=department` | 5 rows |
| `GET {{baseUrl}}/api/v1/role-permissions?roleName=super_admin&resource=branch_department` | 5 rows |

Super Admin is role level `0`, so the auto-grant gives it every new permission.

### 5c. Admin has all of them except `.delete`

| Request | Expectation |
|---|---|
| `GET {{baseUrl}}/api/v1/role-permissions?roleName=admin&resource=branch` | 4 rows (no `delete`) |
| `GET {{baseUrl}}/api/v1/role-permissions?roleName=admin&resource=department` | 4 rows (no `delete`) |
| `GET {{baseUrl}}/api/v1/role-permissions?roleName=admin&resource=branch_department` | 4 rows (no `delete`) |

Admin is role level `1`; the auto-grant gives it `read`, `create`, `update`, `restore` but **not** `delete`, mirroring phase 1 and phase 2.

---

## 6. Automated end-to-end verification

The equivalent of the above walkthrough is codified in `api/scripts/verify-branch-management.ts` — a standalone Node script that:

1. boots the real Express app against Supabase + Redis,
2. logs in as Super Admin to mint a JWT,
3. walks through every route of every phase 3 resource (list, get, create, patch, delete, restore),
4. exercises the cross-resource delete guards (active department assignments blocking a branch delete, active sub-departments and active branch mappings blocking a department delete),
5. exercises the three nuanced restore paths (branch parent-chain, department parent-alive, junction conditional `is_active`),
6. asserts response shape, status codes, and envelope integrity end-to-end,
7. cleans up after itself.

Run it with:

```bash
cd api
npm run verify:branch-management
```

(or equivalently `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-branch-management.ts`).

A successful run ends with **`Stage 3 verdict: PASS`** and exit code 0. The current baseline is **106 green assertions** — setup + auth + branches CRUD + departments CRUD (including tree reparenting and `clearParent`) + branch-departments CRUD (including `clearLocalHead` and immutable branch/department id) + the three delete guards + the three restore gates. See the script itself for the individual assertions.

> **Rate-limit bypass for the script.** `verify-branch-management.ts` fires ~100 requests in a few seconds, which comfortably exceeds the default `RATE_LIMIT_MAX=100/15m`. Like `verify-master-data.ts`, it sets `process.env.SKIP_GLOBAL_RATE_LIMIT = '1'` **before** any `src/` import so the `skip` function on `globalRateLimiter` and `authRateLimiter` turns both into no-ops for the run. Never set this flag in production.

There is also a lighter smoke script at `api/scripts/smoke-branch-management.ts` for a quick "does it boot and CRUD" sanity pass without the exhaustive guard-and-restore coverage.

---

## 7. Endpoint index

| Resource | Method | URL | Permission | Doc |
|---|---|---|---|---|
| Branches | GET | `{{baseUrl}}/api/v1/branches` | `branch.read` | [01 §1.1](01%20-%20branches.md#11-get-apiv1branches) |
| Branches | GET | `{{baseUrl}}/api/v1/branches/:id` | `branch.read` | [01 §1.2](01%20-%20branches.md#12-get-apiv1branchesid) |
| Branches | POST | `{{baseUrl}}/api/v1/branches` | `branch.create` | [01 §1.3](01%20-%20branches.md#13-post-apiv1branches) |
| Branches | PATCH | `{{baseUrl}}/api/v1/branches/:id` | `branch.update` | [01 §1.4](01%20-%20branches.md#14-patch-apiv1branchesid) |
| Branches | DELETE | `{{baseUrl}}/api/v1/branches/:id` | `branch.delete` | [01 §1.5](01%20-%20branches.md#15-delete-apiv1branchesid) |
| Branches | POST | `{{baseUrl}}/api/v1/branches/:id/restore` | `branch.restore` | [01 §1.6](01%20-%20branches.md#16-post-apiv1branchesidrestore) |
| Departments | GET | `{{baseUrl}}/api/v1/departments` | `department.read` | [02 §2.1](02%20-%20departments.md#21-get-apiv1departments) |
| Departments | GET | `{{baseUrl}}/api/v1/departments/:id` | `department.read` | [02 §2.2](02%20-%20departments.md#22-get-apiv1departmentsid) |
| Departments | POST | `{{baseUrl}}/api/v1/departments` | `department.create` | [02 §2.3](02%20-%20departments.md#23-post-apiv1departments) |
| Departments | PATCH | `{{baseUrl}}/api/v1/departments/:id` | `department.update` | [02 §2.4](02%20-%20departments.md#24-patch-apiv1departmentsid) |
| Departments | DELETE | `{{baseUrl}}/api/v1/departments/:id` | `department.delete` | [02 §2.5](02%20-%20departments.md#25-delete-apiv1departmentsid) |
| Departments | POST | `{{baseUrl}}/api/v1/departments/:id/restore` | `department.restore` | [02 §2.6](02%20-%20departments.md#26-post-apiv1departmentsidrestore) |
| Branch-departments | GET | `{{baseUrl}}/api/v1/branch-departments` | `branch_department.read` | [03 §3.1](03%20-%20branch-departments.md#31-get-apiv1branch-departments) |
| Branch-departments | GET | `{{baseUrl}}/api/v1/branch-departments/:id` | `branch_department.read` | [03 §3.2](03%20-%20branch-departments.md#32-get-apiv1branch-departmentsid) |
| Branch-departments | POST | `{{baseUrl}}/api/v1/branch-departments` | `branch_department.create` | [03 §3.3](03%20-%20branch-departments.md#33-post-apiv1branch-departments) |
| Branch-departments | PATCH | `{{baseUrl}}/api/v1/branch-departments/:id` | `branch_department.update` | [03 §3.4](03%20-%20branch-departments.md#34-patch-apiv1branch-departmentsid) |
| Branch-departments | DELETE | `{{baseUrl}}/api/v1/branch-departments/:id` | `branch_department.delete` | [03 §3.5](03%20-%20branch-departments.md#35-delete-apiv1branch-departmentsid) |
| Branch-departments | POST | `{{baseUrl}}/api/v1/branch-departments/:id/restore` | `branch_department.restore` | [03 §3.6](03%20-%20branch-departments.md#36-post-apiv1branch-departmentsidrestore) |

---

## 8. File index

| File | Topic |
|---|---|
| [00 overview](00%20-%20overview.md) | How phase 3 fits on top of phase 2; dependency graph; permission auto-seed; common list contract; Postman environment variables. |
| [01 branches](01%20-%20branches.md) | `/api/v1/branches` — country/state/city-joined CRUD, branch-type enum, manager assignment. |
| [02 departments](02%20-%20departments.md) | `/api/v1/departments` — self-referential tree, `clearParent`, sub-department delete guard. |
| [03 branch-departments](03%20-%20branch-departments.md) | `/api/v1/branch-departments` — M:M junction, per-location metadata, immutable branch/department id, `clearLocalHead`, conditional restore. |
| **04 walkthrough and index** *(you are here)* | End-to-end happy path + delete/restore gates + verify script entry point + endpoint index. |
| `api/docs/postman/phase-3.postman_collection.json` | Importable Postman v2.1 collection with a folder per resource. |
