# Phase 3 — Branch Management

Phase 3 layers the organization's **physical and structural skeleton** on top of the phase-1 geography chain (`countries → states → cities`) and the phase-1 users catalogue. Three resources, all CRUD + soft-delete + restore:

1. **`branches`** — physical locations (head office, regional offices, campuses, warehouses, remote hubs). Every branch points at a country/state/city and may assign an owning manager from the users table.
2. **`departments`** — functional units (Technology, HR, Finance, Content …). Self-referential: a department may nest under a parent department, forming an org tree.
3. **`branch_departments`** — junction table that maps each department to one or more branches with per-location metadata (floor, capacity, extension, local head).

All phase 3 routes:

- require a valid bearer token (phase 1 JWT, `authenticate` middleware),
- are CRUD + soft-delete + restore — shape identical to phase 1 `/api/v1/countries` and phase 2 `/api/v1/states`,
- return the standard envelope (`{ success, message, data, meta? }`),
- call Postgres `udf_*` functions exclusively — no raw SQL in the service layer.

← [Phase 2 walkthrough](../phase%202%20-%20master%20data%20management/06%20-%20walkthrough%20and%20index.md) · **Next →** [01 branches](01%20-%20branches.md)

---

## 1. The three resources

| # | URL | Permission code | DB table | List UDF | Mutation UDFs |
|---|---|---|---|---|---|
| 01 | `/api/v1/branches` | `branch` | `branches` | `udf_get_branches` | `udf_branches_{insert,update,delete,restore}` |
| 02 | `/api/v1/departments` | `department` | `departments` | `udf_get_departments` | `udf_departments_{insert,update,delete,restore}` |
| 03 | `/api/v1/branch-departments` | `branch_department` | `branch_departments` | `udf_get_branch_departments` | `udf_branch_departments_{insert,update,delete,restore}` |

URLs are **kebab-case**, permission codes are **snake_case** (`branch_department`, not `branch-department`) because the authorize middleware parses `<code>.<action>` and the `<code>` side matches the underlying DB table.

## 2. The dependency graph

```
countries ─┐
states ────┼──▶ branches ──┐
cities ────┘               │
                           ├──▶ branch_departments ──▶ (referenced by later phases)
               departments ┘        ▲
                   ▲                │
                   └── self-ref ────┘
```

- `branches` has three required FKs (`country_id`, `state_id`, `city_id`) plus an optional `branch_manager_id` → `users`. Creating an **active** branch requires the three geographic parents to be active and not deleted — the UDF validates this explicitly and returns `400 BAD_REQUEST` otherwise. An **inactive** branch skips the parent-activity check (useful for staging data).
- `departments` is a single table with an optional self-FK (`parent_department_id`). Top-level departments leave the FK NULL; child departments point at a parent. The UDF refuses to make a department its own parent and refuses to activate a child while its parent is inactive.
- `branch_departments` is the M:M junction between branches and departments. Composite uniqueness `(branch_id, department_id)` is enforced at the DB level — you cannot map the same department twice into the same branch. Because the junction refers to both sides, the insert UDF validates that both parents exist, are not deleted, and (for active mappings) are active. Changing `branch_id` or `department_id` after insert is **not allowed** — delete + re-insert instead.

## 3. Permissions — auto-seeded, not hand-written

Same `udf_auto_create_resource_permissions` helper as phase 2. The phase-3 seed file `phase-03-branch-management/04_seed_permissions.sql` calls it three times (once per resource) with `p_include_own=FALSE`, producing **15 permission rows**:

| Role | Level | What it gets |
|---|---|---|
| Super Admin | 0 | All five actions (`read`, `create`, `update`, `delete`, `restore`) for all three resources. |
| Admin | 1 | `read`, `create`, `update`, `restore` — **no `delete`**, matching the phase-1/phase-2 pattern. |
| Everyone else | 2+ | Nothing — grant explicitly via `/role-permissions` or `/user-permissions`. |

A freshly-provisioned Super Admin can do anything on all three phase-3 resources with no extra config. A freshly-provisioned Admin can create, read, update, and restore, but cannot hard-delete.

## 4. List contract

Every `GET /api/v1/<resource>` in phase 3 accepts this common set of params:

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. `pageSize` capped at 100 server-side. |
| `searchTerm` | string | `ILIKE` across the primary text columns of the resource and its joined layers. |
| `isActive`, `isDeleted` | bool | Target the **primary** layer by default (`branch` / `department` / `bd`). Use the layer-specific params for joined tables. |
| `sortColumn`, `sortDirection` | enum | Whitelisted per-resource. Unknown values → `400 VALIDATION_ERROR`. |

`branches` and `branch-departments` additionally accept a `sortTable` param (see each resource's doc) because their list UDFs expose multiple joinable tables.

## 5. Error envelope

All phase 3 routes use the same envelope as phase 1 and phase 2. The codes you'll see most often:

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod rejected the query/body/params. `details[]` is the `issues` array. |
| 400 | `BAD_REQUEST` | Business-rule violation. Common phase-3 examples: trying to activate a branch when its city/state/country is inactive, trying to make a department its own parent, trying to delete a branch that still has active department assignments, trying to delete a department that still has active branch mappings, duplicate `(branchId, departmentId)` mapping on insert. |
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Authenticated but no `<resource>.<action>` permission. |
| 404 | `NOT_FOUND` | No row with that id. |
| 409 | `DUPLICATE_ENTRY` | Unique-constraint clash (e.g. branch `code` collision, department `(name)` collision). |

## 6. Active-flag defaults

All three phase-3 resources default `isActive` to **`false`** at the API layer on `POST` when the body omits the flag. This is a deliberate safety net — the UDFs check parent-activity cascades on activation, so defaulting to active would make every create path a potential source of `400 BAD_REQUEST` if even one parent happens to be inactive. Callers that want an immediately-live row must pass `isActive: true` explicitly.

## 7. Postman environment

Every endpoint in this phase is documented as a Postman request using two **environment variables** — set them once on your Postman environment and every request in the collection will resolve them automatically:

| Variable | Example value | Where it is used |
|---|---|---|
| `baseUrl` | `http://localhost:3000` (local) · `https://api.growupmore.com` (prod) | Every request URL is written as `{{baseUrl}}/api/v1/...`. |
| `accessToken` | a Super Admin JWT, minted once per session via `POST {{baseUrl}}/api/v1/auth/login` | Every request sends `Authorization: Bearer {{accessToken}}`. |

**Minting an access token** — run this request once and copy `data.accessToken` from the response into the `accessToken` environment variable (or wire it up as a Postman "Tests" script that stores `pm.response.json().data.accessToken`):

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/auth/login` |
| Headers | `Content-Type: application/json` |
| Body | `{ "email": "superadmin@growupmore.com", "password": "<password>" }` |

A machine-readable Postman v2.1 collection is also available at `api/docs/postman/phase-3.postman_collection.json` — import it and the folder tree will mirror the files in this folder (branches / departments / branch-departments), each request pre-populated with headers, body, and example responses.

## 8. Where to look next

| Topic | File |
|---|---|
| Branches (`/api/v1/branches`) | [01 branches](01%20-%20branches.md) |
| Departments (`/api/v1/departments`) | [02 departments](02%20-%20departments.md) |
| Branch-departments (junction) | [03 branch-departments](03%20-%20branch-departments.md) |
| End-to-end walkthrough + endpoint index + verify script | [04 walkthrough and index](04%20-%20walkthrough%20and%20index.md) |
| Postman collection (v2.1) | `api/docs/postman/phase-3.postman_collection.json` |
