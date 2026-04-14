# Phase 4 — Walkthrough & Index

End-to-end smoke test for the `/api/v1/user-profiles` module, plus a one-page endpoint index and pointers to the SQL and verification scripts. This is the file to read if you want to exercise phase 4 from zero.

← [01 user-profiles](01%20-%20user-profiles.md) · **Next →** *Phase 5 — coming soon*

---

## 1. Pre-flight

Before any of the flows below will work:

1. **Migrations applied.** Run the merged schema script. All of phase-01 → phase-04 must be in place — phase 4 depends on `users`, `roles`, `permissions`, `role_permissions`, `countries/states/cities`, `languages`, and the `udf_auto_create_resource_permissions` helper.
2. **Permission seed applied.** `phase-04-user-profiles/02_seed_permissions.sql` is auto-discovered by `merge_sql.py` (numeric prefix `02_` at the phase root). Verify with:
   ```sql
   SELECT code, scope FROM permissions WHERE resource = 'user_profile' ORDER BY display_order;
   -- Expect 7 rows: create, read, read.own, update, update.own, delete, restore
   ```
3. **Accounts provisioned.** You need at least:
   - A super-admin (role `super_admin`). Ships as `sa@growupmore.com` in the seed.
   - A regular student (role `student`). Create one via `POST /api/v1/users` as super-admin, or seed one directly.
4. **Tokens minted.** Mint two JWTs via `POST /api/v1/auth/login` — one for the super-admin, one for the student. Keep them in two Postman environments (`superadmin`, `student`).

## 2. Happy path — admin full-circle

Run these as **super-admin** (`Authorization: Bearer <super-admin JWT>`).

### 2.1 List — should include the seed profile for user 1

```
GET {{baseUrl}}/api/v1/user-profiles?pageSize=10
```

Expect `200 OK` with at least one row (`id=1`, `userId=1`, `userRole=super_admin`) because `phase-04-user-profiles/01-user-profiles/01_table.sql` seeds a profile for the super-admin.

### 2.2 Create a profile for the student (user id 8)

```
POST {{baseUrl}}/api/v1/user-profiles
Content-Type: application/json

{
  "userId": 8,
  "gender": "female",
  "nationality": "Indian",
  "countryId": 1,
  "stateId": 1,
  "cityId": 1,
  "pincode": "400001",
  "preferredLanguageId": 1,
  "themePreference": "dark",
  "profileCompletion": 30
}
```

Expect `201 Created` with the full `UserProfileDto`. Save the returned `data.id` — it's the profile id the next steps need.

### 2.3 Update KYC + bank as admin

```
PATCH {{baseUrl}}/api/v1/user-profiles/{{profileId}}
Content-Type: application/json

{
  "aadharNumber": "XXXX-XXXX-1234",
  "panNumber": "ABCDE1234F",
  "bankName": "HDFC Bank",
  "bankIfscCode": "HDFC0001234",
  "bankAccountType": "savings",
  "profileCompletion": 75
}
```

Expect `200 OK`. The admin body schema accepts these fields, so the PATCH persists them.

### 2.4 Hard-delete (super-admin only)

```
DELETE {{baseUrl}}/api/v1/user-profiles/{{profileId}}
```

Expect `200 OK` with `{ id, deleted: true }`. The parent `users` row is untouched — `GET /api/v1/users/8` still returns the student.

### 2.5 Duplicate-create guard

Re-run `POST /api/v1/user-profiles` with `userId: 8`. Because the delete in §2.4 cleared the row, this should succeed again (the 1:1 UNIQUE is clear). If you try the same POST twice in a row without deleting first, expect `400 BAD_REQUEST` with `Profile already exists for user id 8. Use udf_update_user_profiles instead.`.

## 3. Happy path — self-service

Switch to the **student** token for the rest of this section.

### 3.1 GET /me before anything exists

If the profile was just deleted, expect `404 NOT_FOUND` with `You do not have a user profile yet. POST /me to create one.`.

### 3.2 POST /me — safe fields only

```
POST {{baseUrl}}/api/v1/user-profiles/me
Content-Type: application/json

{
  "gender": "female",
  "nationality": "Indian",
  "headline": "Aspiring backend engineer",
  "about": "CS student, exploring distributed systems.",
  "countryId": 1,
  "stateId": 1,
  "cityId": 1,
  "preferredLanguageId": 1,
  "themePreference": "dark"
}
```

Expect `201 Created`.

### 3.3 POST /me rejects sensitive fields

```
POST {{baseUrl}}/api/v1/user-profiles/me
Content-Type: application/json

{
  "gender": "female",
  "aadharNumber": "XXXX-XXXX-9999"
}
```

Expect `400 VALIDATION_ERROR`, specifically with details mentioning `aadharNumber` (zod `.strict()` rejects unknown keys). This proves the self-service schema layer is doing its job.

### 3.4 PATCH /me — safe update

```
PATCH {{baseUrl}}/api/v1/user-profiles/me
Content-Type: application/json

{
  "headline": "Aspiring backend engineer — now interning at Acme"
}
```

Expect `200 OK`.

### 3.5 GET /:id — the self-or-admin gate

Fetch your own profile id (the `data.id` from §3.2). `GET /api/v1/user-profiles/<id>` should return `200 OK` because `authorizeSelfOr` resolves the owner to the student and matches it against `req.user.id`.

Now try `GET /api/v1/user-profiles/1` (the super-admin's profile). Expect `403 FORBIDDEN` with `Forbidden: user_profile.read.own only grants access to your own record` — the student holds only the own-scope permission and is not the owner.

### 3.6 DELETE /:id — should be blocked

Switch back to the student token and attempt `DELETE /api/v1/user-profiles/<your-profile-id>`. Expect `403 FORBIDDEN` with `Missing required permission: user_profile.delete` — the student token has neither the permission nor the super-admin role.

## 4. Unhappy paths — admin sanity checks

Switch back to the **super-admin** token.

### 4.1 Non-existent id

```
GET {{baseUrl}}/api/v1/user-profiles/99999
```

Expect `404 NOT_FOUND` with `User profile 99999 not found`.

### 4.2 Bad country id on create

```
POST {{baseUrl}}/api/v1/user-profiles
Content-Type: application/json

{ "userId": 2, "countryId": 99999 }
```

Expect `400 BAD_REQUEST` with the UDF's own message (`Country id 99999 does not exist or is deleted.`).

### 4.3 Update after parent soft-delete

1. Soft-delete the target user: `DELETE /api/v1/users/2`.
2. Try to update their profile: `PATCH /api/v1/user-profiles/<id>` with `{ "headline": "test" }`.
3. Expect `400 BAD_REQUEST` with `Cannot update user profile <id>: parent user is soft-deleted.`.
4. Restore the user with `POST /api/v1/users/2/restore` and the update should succeed again.

## 5. SQL-level smoke test

The phase-04 schema ships a self-contained `test_user_profiles.sql` at:

```
phase-04-user-profiles/01-user-profiles/test_user_profiles.sql
```

It runs inside a `BEGIN … ROLLBACK` block so it can be executed on a live database without leaving side effects. The groups it covers:

| Group | What it checks |
|---|---|
| **A** | Table, view, get UDF, mutation UDFs, JSONB return shape (`A5`). |
| **B** | Insert — minimal, full, duplicate-for-same-user, bad FK, non-existent parent user. |
| **C** | Update — partial, FK validation, parent soft-delete guard. |
| **D** | Delete — happy path + re-delete idempotence + non-existent id. |
| **E** | Get — by id, by user id, filter, search, sort, pagination. |
| **F** | View (`uv_user_profiles`) — join correctness, soft-delete parent visibility. |
| **G** | Hard-delete direct SQL — FK RESTRICT enforced against `users`. |
| **H** | Check constraints — gender, profile_completion range. Messages surface via the UDF envelope. |
| **I** | Permission seed wiring — 7 rows on `permissions`, super-admin has all 7, admin has 6 (no delete), instructor has exactly `read.own + update.own`, student has exactly `read.own + update.own`. |

Run with:

```sql
BEGIN;
\i phase-04-user-profiles/01-user-profiles/test_user_profiles.sql
ROLLBACK;  -- or COMMIT if you want to keep the state changes
```

Every assertion raises a descriptive exception on failure (`A5 FAIL: one or more mutation UDFs do not RETURN JSONB`, `I4 FAIL: instructor does not hold exactly 2 user_profile permissions`, etc.), so you get a clear signpost pointing at the broken piece.

## 6. Verify script

The Node-side verify script lives at `api/scripts/verify-phase-04.ts` *(create if not yet present — model it on the phase-03 verify script; set `process.env.SKIP_GLOBAL_RATE_LIMIT = '1'` at the top before any `src/` import)*. It exercises:

1. Admin list, create, update, delete.
2. Student `/me` get → 404, post → 201, get → 200, patch → 200, post again → 400 (already exists).
3. Student `/:id` on own → 200, on foreign → 403.
4. Student `DELETE /:id` → 403.
5. Admin `PATCH /:id` parent-soft-delete guard (set user is_deleted, attempt update, expect `400`, restore user).

## 7. Endpoint index

| Method | Path | Permission (global / own) | Notes |
|---|---|---|---|
| `GET` | `/api/v1/user-profiles` | `user_profile.read` | Admin list with geography + role filters. |
| `GET` | `/api/v1/user-profiles/me` | `user_profile.read.own` | Self read. 404 if profile doesn't exist yet. |
| `POST` | `/api/v1/user-profiles/me` | `user_profile.update.own` | Self create — safe field subset. |
| `PATCH` | `/api/v1/user-profiles/me` | `user_profile.update.own` | Self update — safe field subset. |
| `GET` | `/api/v1/user-profiles/:id` | `user_profile.read` *or* `user_profile.read.own` | Self-or-admin. |
| `POST` | `/api/v1/user-profiles` | `user_profile.create` | Admin create — full body. |
| `PATCH` | `/api/v1/user-profiles/:id` | `user_profile.update` *or* `user_profile.update.own` | Self-or-admin. Accepts the full body on both branches. |
| `DELETE` | `/api/v1/user-profiles/:id` | `user_profile.delete` + role `super_admin` | Hard delete. |

## 8. Cross-references

| Where to look | Why |
|---|---|
| [`api/src/core/middlewares/authorize-self-or.ts`](../../../api/src/core/middlewares/authorize-self-or.ts) | The new self-or-global middleware. |
| [`api/src/modules/user-profiles/user-profiles.schemas.ts`](../../../api/src/modules/user-profiles/user-profiles.schemas.ts) | Zod schemas for list/create/update/self-update. |
| [`api/src/modules/user-profiles/user-profiles.service.ts`](../../../api/src/modules/user-profiles/user-profiles.service.ts) | DTO, row mapping, UDF wrappers. |
| [`api/src/api/v1/user-profiles/user-profiles.routes.ts`](../../../api/src/api/v1/user-profiles/user-profiles.routes.ts) | Router definition and the self-or-admin wiring. |
| [`phase-04-user-profiles/01-user-profiles/`](../../../phase-04-user-profiles/01-user-profiles) | Table, view, get/insert/update/delete UDFs, SQL smoke test. |
| [`phase-04-user-profiles/02_seed_permissions.sql`](../../../phase-04-user-profiles/02_seed_permissions.sql) | Permission seed — instructor/student own grants live here. |
