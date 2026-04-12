# Phase 4 — User Profiles

Phase 4 adds **rich profile data** on top of the phase-1 users table. A `user_profiles` row is a 1:1 detail record that stores everything the bare `users` row intentionally omits: date of birth, gender, nationality, addresses (permanent + current), contact fallbacks, emergency contact, KYC identifiers (Aadhar, PAN, passport), bank details, regional preferences, and a profile-completion signal. One resource, one table, a focused module — but it introduces the first **self-service** permission pattern in the API where students and instructors are allowed to read and update their own rows.

All phase 4 routes:

- require a valid bearer token (phase 1 JWT, `authenticate` middleware),
- call the phase-04 UDFs exclusively — `udf_get_user_profiles`, `udf_insert_user_profiles`, `udf_update_user_profiles`, `udf_delete_user_profiles`,
- return the standard envelope (`{ success, message, data, meta? }`),
- and use a **different authorization model** from phase 2/3 — see §3 below.

← [Phase 3 walkthrough](../phase%203%20-%20branch%20management/04%20-%20walkthrough%20and%20index.md) · **Next →** [01 user-profiles](01%20-%20user-profiles.md)

---

## 1. The resource

| # | URL | Permission code | DB table | List UDF | Mutation UDFs |
|---|---|---|---|---|---|
| 01 | `/api/v1/user-profiles` | `user_profile` | `user_profiles` | `udf_get_user_profiles` | `udf_insert_user_profiles`, `udf_update_user_profiles`, `udf_delete_user_profiles` |

The URL is **kebab-case** (`/user-profiles`); the permission code is **snake_case** (`user_profile`) to match the DB resource name. The authorize middleware parses permission strings as `<code>.<action>[.scope]`, so the code must be snake-case.

## 2. Inheritance model — why there is no `isActive` / `isDeleted`

Unlike every other phase-02 / phase-03 resource, `user_profiles` has **no `is_active` or `is_deleted` columns of its own**. The table is a 1:1 detail of `users`, and status is inherited from the parent row:

- `users.is_active = FALSE` → profile is effectively inactive
- `users.is_deleted = TRUE` → profile is effectively deleted

Every list response therefore surfaces `userIsActive` and `userIsDeleted` at the top level, and inside the nested `user` object. Callers that want the "live" list (the default) get only profiles whose parent user is not soft-deleted — `udf_get_user_profiles` filters them out unless you pass `includeDeletedUser=true`.

Two practical consequences:

1. **There is no restore endpoint.** If you want a profile back, re-create it with `POST /` or `POST /me` — the 1:1 UNIQUE constraint on `user_id` is now clear, so insert is allowed.
2. **`DELETE /:id` is a hard delete.** It removes the profile row only. The parent users row is untouched. This is deliberate: use it for explicit "scrub this user's profile" admin operations, and keep account-level deletion on `DELETE /api/v1/users/:id` (which soft-deletes the `users` row via `udf_delete_users`). See [phase-04/01-user-profiles/06_fn_delete.sql](../../../phase-04-user-profiles/01-user-profiles/06_fn_delete.sql) for the rationale.

## 3. Permissions — three tiers + self-scope

The `user_profile` resource seeds **seven permissions** via `udf_auto_create_resource_permissions('user_profile', …, p_include_own := TRUE)`:

| Code | Scope | Description |
|---|---|---|
| `user_profile.create` | global | Create a profile for any user. |
| `user_profile.read` | global | List / get any profile. |
| `user_profile.read.own` | own | Read only the caller's own profile. |
| `user_profile.update` | global | Update any profile, including KYC/bank fields. |
| `user_profile.update.own` | own | Update only the caller's own profile. |
| `user_profile.delete` | global | Hard-delete any profile. |
| `user_profile.restore` | global | Reserved for symmetry; phase 4 has no restore endpoint, so it is unused. |

The helper auto-assigns:

| Role | Level | What it gets |
|---|---|---|
| Super Admin | 0 | All 7 permissions. |
| Admin | 1 | 6 — everything except `user_profile.delete` (matches phase-2/phase-3 pattern). |

On top of that, `phase-04-user-profiles/02_seed_permissions.sql` adds an explicit pair of `role_permissions` rows for **Instructor** (role code `instructor`, level 4) and **Student** (role code `student`, level 5):

- `user_profile.read.own`
- `user_profile.update.own`

Neither role gets any global-scope permission on `user_profile`. Everything else (listing all profiles, creating profiles for other users, mutating KYC on behalf of someone else) is locked down at the permission layer.

## 4. The `authorizeSelfOr` middleware

Phase 4 introduces `core/middlewares/authorize-self-or.ts`, a new authorization helper that takes three inputs:

1. `globalPermission` — lets the caller act on any record if they hold it.
2. `ownPermission` — lets the caller act only on rows they own.
3. `resolveTargetUserId(req)` — a function that returns the `user_id` that owns the target record.

The middleware evaluates the caller in two stages. First: if the user's token carries the **global** permission, they pass immediately. Second: if the user holds only the **own** permission, the middleware calls `resolveTargetUserId(req)` and compares the result to `req.user.id`; matching means pass, anything else means `403 FORBIDDEN`. This is the exact shape phase 4 needs — admins hit the endpoint as "I have `user_profile.update`", students hit it as "I have `user_profile.update.own` and the row belongs to me".

For endpoints that only ever act on the caller's own row (`GET /me`, `POST /me`, `PATCH /me`) we use plain `authorize('user_profile.read.own')` or `authorize('user_profile.update.own')` instead — there is no "admin bypass" on `/me` because admins simply use `/:id` with `user_profile.read` / `user_profile.update`.

## 5. Admin vs self-service body split

`PATCH /me` and `PATCH /:id` use **different zod schemas** on purpose:

- `updateUserProfileBodySchema` (admin) exposes every column the UDF accepts. Admins can set Aadhar, PAN, passport, bank details, GST, and profile-completion flags.
- `updateMyUserProfileBodySchema` (self) is `.strict()` and blocks the sensitive fields above. If a student POSTs `{ "aadharNumber": "…" }` to `PATCH /me`, zod returns `400 VALIDATION_ERROR` — no silent drop.

`POST /me` uses the same safe subset (`createMyUserProfileBodySchema`). Students who need a KYC-annotated profile must wait for an admin to use `POST /` or `PATCH /:id`.

Note the asymmetry: when a **self-caller** (student/instructor) hits `PATCH /:id` with their own profile id, they pass the self-or-admin gate and the **full** `updateUserProfileBodySchema` is used. That is documented as a trade-off — the `/me` route is the client-preferred entry point for the safe path; `/:id` is the record-centric endpoint and admins expect it to accept the full body. If an installation wants to tighten this, swap `validate({ body: updateUserProfileBodySchema })` for a role-aware variant on that route.

## 6. List contract

`GET /api/v1/user-profiles` is admin-only (`user_profile.read`) and accepts:

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination (1..100). |
| `searchTerm` | string | `ILIKE` across first name, last name, email, mobile, nationality, about, headline, permanent-address city/state/country. |
| `gender`, `bloodGroup`, `maritalStatus` | enum | Profile filters. |
| `nationality` | string | Contains match (case-insensitive). |
| `isProfileComplete` | bool | Filter on the completion flag. |
| `userRole` | string | Filter by the parent user's role code (`student`, `instructor`, …). |
| `userIsActive` | bool | Filter by the inherited active flag. |
| `countryId`, `stateId`, `cityId` | int | Permanent-address geography filters. |
| `preferredLanguageId` | int | Filter by preferred language. |
| `themePreference` | enum | `light` / `dark` / `system`. |
| `includeDeletedUser` | bool | Admin audit flag — defaults to `false`. Set `true` to include profiles of soft-deleted users. |
| `sortColumn`, `sortDirection` | enum | Whitelisted — see `USER_PROFILE_SORT_COLUMNS` in `user-profiles.schemas.ts`. |

## 7. Error envelope

Same envelope as every other phase. Codes you'll see most often:

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod rejected the query/body/params. |
| 400 | `BAD_REQUEST` | Business-rule violation from the UDF (missing FK, duplicate profile for user, supplied FK that is soft-deleted, parent user soft-deleted on update). |
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Authenticated but no matching `user_profile.*` permission, or own-scope caller hitting someone else's row. |
| 404 | `NOT_FOUND` | No profile with that id, or `GET /me` called before the caller has one. |
| 409 | `DUPLICATE_ENTRY` | Second `POST` for the same user (the `UNIQUE(user_id)` constraint fires). |

## 8. Postman environment

Every endpoint on the next page is documented as a Postman request using two environment variables — set them once on your Postman environment:

| Variable | Example value | Where it is used |
|---|---|---|
| `baseUrl` | `http://localhost:3000` (local) · `https://api.growupmore.com` (prod) | Every request URL is written as `{{baseUrl}}/api/v1/...`. |
| `accessToken` | a JWT minted via `POST {{baseUrl}}/api/v1/auth/login` | Every request sends `Authorization: Bearer {{accessToken}}`. |

The self-service flows (`/me` routes) want a **student** or **instructor** token; the admin flows want a **super-admin** or **admin** token. Because the two share the same `{{accessToken}}` variable, you typically keep two Postman environments — "superadmin" and "student" — and switch between them while exercising the phase.

## 9. Where to look next

| Topic | File |
|---|---|
| User profiles (`/api/v1/user-profiles`) — full endpoint contracts | [01 user-profiles](01%20-%20user-profiles.md) |
| End-to-end walkthrough + endpoint index + verify script | [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md) |
