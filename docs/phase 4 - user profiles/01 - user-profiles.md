# Phase 4 — User Profiles

A user profile is the 1:1 detail record for a `users` row. It stores personal data (DOB, gender, nationality), addresses (permanent + current), contact fallbacks (alternate email/mobile/WhatsApp), emergency contact, KYC identifiers (Aadhar/PAN/passport), banking details (bank name, account, IFSC, UPI, GST), and preferences (language, timezone, theme, notification channels, profile completion flags).

This is the first phase 4 resource to introduce **self-service routes**: students and instructors can read and update their own profile via `/me`. Admins and super-admins use the `/:id` routes (and `/`) to list and mutate any profile.

All routes require auth. Permission codes: `user_profile.create`, `user_profile.read`, `user_profile.read.own`, `user_profile.update`, `user_profile.update.own`, `user_profile.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1user-profiles) | `GET` | `{{baseUrl}}/api/v1/user-profiles` | `user_profile.read` | List all profiles (admin+). |
| [§1.2](#12-get-apiv1user-profilesme) | `GET` | `{{baseUrl}}/api/v1/user-profiles/me` | `user_profile.read.own` | Return the caller's own profile. |
| [§1.3](#13-post-apiv1user-profilesme) | `POST` | `{{baseUrl}}/api/v1/user-profiles/me` | `user_profile.update.own` | Self-service create — safe field subset. |
| [§1.4](#14-patch-apiv1user-profilesme) | `PATCH` | `{{baseUrl}}/api/v1/user-profiles/me` | `user_profile.update.own` | Self-service update — safe field subset. |
| [§1.5](#15-get-apiv1user-profilesid) | `GET` | `{{baseUrl}}/api/v1/user-profiles/:id` | `user_profile.read` *or* `user_profile.read.own` (+ self match) | Get one profile by id. |
| [§1.6](#16-post-apiv1user-profiles) | `POST` | `{{baseUrl}}/api/v1/user-profiles` | `user_profile.create` | Admin create — full body. |
| [§1.7](#17-patch-apiv1user-profilesid) | `PATCH` | `{{baseUrl}}/api/v1/user-profiles/:id` | `user_profile.update` *or* `user_profile.update.own` (+ self match) | Update one profile by id. |
| [§1.8](#18-delete-apiv1user-profilesid) | `DELETE` | `{{baseUrl}}/api/v1/user-profiles/:id` | `user_profile.delete` + super-admin role | Hard-delete one profile. |

> `/me` endpoints must be declared before `/:id` in the router so Express does not treat `me` as an id segment. If you add new `/me`-style routes in future phases, do the same.

---

## 1.1 `GET /api/v1/user-profiles`

List profiles. Backed by `udf_get_user_profiles`, which joins `user_profiles` → `uv_users` → `countries/states/cities` (permanent + current) → `languages`. Defaults to excluding profiles of soft-deleted users; pass `includeDeletedUser=true` for the admin audit view.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-profiles` |
| Permission | `user_profile.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across first name, last name, email, mobile, nationality, about, headline, permanent-address city/state/country. |
| `gender` | enum | — | `male` / `female` / `other`. |
| `bloodGroup` | enum | — | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`. |
| `maritalStatus` | enum | — | `single`, `married`, `divorced`, `widowed`, `prefer_not_to_say`. |
| `nationality` | string | — | Contains match (case-insensitive). |
| `isProfileComplete` | bool | — | Completion flag filter. |
| `userRole` | string | — | Filter by parent user's role code, e.g. `student`, `instructor`. |
| `userIsActive` | bool | — | Filter by inherited active flag. |
| `countryId` / `stateId` / `cityId` | int | — | Permanent-address geography filters. |
| `preferredLanguageId` | int | — | Filter by preferred language. |
| `themePreference` | enum | — | `light` / `dark` / `system`. |
| `includeDeletedUser` | bool | `false` | Include profiles whose parent user is soft-deleted. |
| `sortColumn` | enum | `profile_id` | `profile_id`, `user_id`, `date_of_birth`, `gender`, `nationality`, `profile_completion`, `created_at`, `updated_at`, `first_name`, `last_name`, `role`, `user_is_active`, `country_name`. |
| `sortDirection` | enum | `ASC` | `ASC` / `DESC`. |

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
      "userId": 1,
      "dateOfBirth": null,
      "gender": "male",
      "bloodGroup": null,
      "maritalStatus": null,
      "nationality": "Indian",
      "about": "Platform Super Administrator — GrowUpMore E-Learning",
      "headline": "Super Admin | GrowUpMore",
      "profilePhotoUrl": null,
      "coverPhotoUrl": null,
      "permanentAddress": {
        "addressLine1": null,
        "addressLine2": null,
        "landmark": null,
        "countryId": 1,
        "stateId": 1,
        "cityId": 1,
        "pincode": null,
        "countryName": "India",
        "stateName": "Maharashtra",
        "cityName": "Mumbai"
      },
      "currentAddress": {
        "addressLine1": null,
        "addressLine2": null,
        "landmark": null,
        "countryId": null,
        "stateId": null,
        "cityId": null,
        "pincode": null,
        "countryName": null,
        "stateName": null,
        "cityName": null,
        "isSameAsPermanent": false
      },
      "contact": {
        "alternateEmail": null,
        "alternateMobile": null,
        "whatsappNumber": null
      },
      "emergency": {
        "name": null,
        "phone": null,
        "relation": null
      },
      "kyc": {
        "aadharNumber": null,
        "panNumber": null,
        "passportNumber": null
      },
      "bank": {
        "name": null,
        "accountNumber": null,
        "ifscCode": null,
        "branch": null,
        "accountType": "savings",
        "upiId": null,
        "gstNumber": null
      },
      "preferences": {
        "preferredLanguageId": 1,
        "preferredLanguageName": "English",
        "preferredLanguageNativeName": "English",
        "timezone": "Asia/Kolkata",
        "themePreference": "system",
        "emailNotifications": true,
        "smsNotifications": false,
        "pushNotifications": true
      },
      "profileCompletion": 40,
      "isProfileComplete": false,
      "createdBy": 1,
      "updatedBy": 1,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "userIsActive": true,
      "userIsDeleted": false,
      "user": {
        "id": 1,
        "firstName": "Super",
        "lastName": "Admin",
        "email": "sa@growupmore.com",
        "mobile": null,
        "roleId": 1,
        "roleCode": "super_admin",
        "roleName": "Super Admin",
        "isActive": true,
        "isDeleted": false,
        "isEmailVerified": true,
        "isMobileVerified": false,
        "countryName": "India",
        "countryIso2": "IN",
        "countryPhoneCode": "+91"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 403 Forbidden — caller lacks `user_profile.read`

```json
{
  "success": false,
  "message": "Missing required permission: user_profile.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-profiles` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across name / email / headline / city | `?searchTerm=priya` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=bangalore` |
| Gender — male | `?gender=male` |
| Gender — female | `?gender=female` |
| Gender — other | `?gender=other` |
| Blood group — `O+` | `?bloodGroup=O%2B` |
| Blood group — `AB-` | `?bloodGroup=AB-` |
| Marital status — single | `?maritalStatus=single` |
| Marital status — married | `?maritalStatus=married` |
| Marital status — divorced | `?maritalStatus=divorced` |
| Marital status — widowed | `?maritalStatus=widowed` |
| Marital status — prefer not to say | `?maritalStatus=prefer_not_to_say` |
| Nationality — `Indian` | `?nationality=Indian` |
| Profile complete only | `?isProfileComplete=true` |
| Profile incomplete only | `?isProfileComplete=false` |
| Filter by parent user role — `student` | `?userRole=student` |
| Filter by parent user role — `instructor` | `?userRole=instructor` |
| Active users only | `?userIsActive=true` |
| Inactive users only | `?userIsActive=false` |
| Admin audit — include soft-deleted parents | `?includeDeletedUser=true` |
| Country filter (permanent address) | `?countryId=1` |
| Country + state | `?countryId=1&stateId=14` |
| Country + state + city | `?countryId=1&stateId=14&cityId=208` |
| Preferred language filter | `?preferredLanguageId=1` |
| Theme preference — light | `?themePreference=light` |
| Theme preference — dark | `?themePreference=dark` |
| Theme preference — system | `?themePreference=system` |
| Sort by `profile_id` ASC (default) | `?sortColumn=profile_id&sortDirection=ASC` |
| Sort by `profile_id` DESC | `?sortColumn=profile_id&sortDirection=DESC` |
| Sort by `user_id` ASC | `?sortColumn=user_id&sortDirection=ASC` |
| Sort by `date_of_birth` ASC | `?sortColumn=date_of_birth&sortDirection=ASC` |
| Sort by `date_of_birth` DESC | `?sortColumn=date_of_birth&sortDirection=DESC` |
| Sort by `gender` ASC | `?sortColumn=gender&sortDirection=ASC` |
| Sort by `nationality` ASC | `?sortColumn=nationality&sortDirection=ASC` |
| Sort by `profile_completion` DESC | `?sortColumn=profile_completion&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Sort by `first_name` ASC | `?sortColumn=first_name&sortDirection=ASC` |
| Sort by `last_name` ASC | `?sortColumn=last_name&sortDirection=ASC` |
| Sort by `role` ASC | `?sortColumn=role&sortDirection=ASC` |
| Sort by `user_is_active` DESC | `?sortColumn=user_is_active&sortDirection=DESC` |
| Sort by `country_name` ASC | `?sortColumn=country_name&sortDirection=ASC` |
| Combo — active students, sort by name | `?pageIndex=1&pageSize=50&userRole=student&userIsActive=true&sortColumn=first_name&sortDirection=ASC` |
| Combo — female instructors, newest first | `?pageIndex=1&pageSize=20&gender=female&userRole=instructor&sortColumn=created_at&sortDirection=DESC` |
| Combo — search `mumbai`, city filter, completed profiles | `?pageIndex=1&pageSize=20&searchTerm=mumbai&cityId=208&isProfileComplete=true&sortColumn=profile_completion&sortDirection=DESC` |

> `bloodGroup=O+` must be URL-encoded — Postman and browsers interpret a raw `+` in a query string as a space. Use `O%2B`, `A%2B`, `B%2B`, `AB%2B` for the `+` groups. The `-` groups (`O-`, `A-`, `B-`, `AB-`) need no encoding.

---

## 1.2 `GET /api/v1/user-profiles/me`

Return the caller's own profile. This route is the self-service read path for students and instructors; admins can use it too but typically hit `/:id` instead.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-profiles/me` |
| Permission | `user_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Same envelope as `GET /:id` — single profile DTO in `data`.

#### 404 Not Found — caller has no profile yet

```json
{
  "success": false,
  "message": "You do not have a user profile yet. POST /me to create one.",
  "code": "NOT_FOUND"
}
```

Clients should handle this by prompting the user to fill in their profile and then calling `POST /me`.

---

## 1.3 `POST /api/v1/user-profiles/me`

Self-service create. Accepts the **safe subset** of profile fields — KYC (`aadharNumber`, `panNumber`, `passportNumber`), bank fields, GST, and completion flags are blocked at the zod layer.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-profiles/me` |
| Permission | `user_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body** — any combination of the safe fields. Typical first-run body:

```json
{
  "gender": "male",
  "nationality": "Indian",
  "about": "Full-stack engineer, learning DS&A.",
  "headline": "Senior Engineer at Acme",
  "addressLine1": "12, Linking Road",
  "countryId": 1,
  "stateId": 1,
  "cityId": 1,
  "pincode": "400050",
  "preferredLanguageId": 1,
  "timezone": "Asia/Kolkata",
  "themePreference": "dark",
  "emailNotifications": true,
  "pushNotifications": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "User profile created",
  "data": { /* full UserProfileDto */ }
}
```

#### 400 Validation error — sensitive field supplied

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["aadharNumber"], "message": "Unrecognized key(s) in object: 'aadharNumber'" }
  ]
}
```

#### 400 Bad request — profile already exists

```json
{
  "success": false,
  "message": "Error inserting user profile: Profile already exists for user id 5. Use udf_update_user_profiles instead.",
  "code": "BAD_REQUEST"
}
```

---

## 1.4 `PATCH /api/v1/user-profiles/me`

Self-service partial update. Same safe subset as `POST /me`. Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-profiles/me` |
| Permission | `user_profile.update.own` |

**Request body** — any subset of the safe fields. Example:

```json
{
  "headline": "Senior Engineer at Acme — now mentoring",
  "themePreference": "light"
}
```

### Responses

#### 200 OK

Full updated `UserProfileDto` in `data`.

#### 400 Validation error

Same shape as §1.3 when sensitive fields are supplied or when the body is empty.

#### 404 Not Found

If the caller has no profile yet — `POST /me` first.

---

## 1.5 `GET /api/v1/user-profiles/:id`

Get one profile by id. Uses `authorizeSelfOr` — if the caller holds `user_profile.read` they pass unconditionally; otherwise the middleware resolves the owner of `:id` and allows the call only when the owner is the caller.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-profiles/:id` |
| Permission | `user_profile.read` *or* `user_profile.read.own` |

### Responses

#### 200 OK

Full `UserProfileDto` in `data`.

#### 403 Forbidden — own-scope caller, someone else's profile

```json
{
  "success": false,
  "message": "Forbidden: user_profile.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User profile 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.6 `POST /api/v1/user-profiles`

Admin create — full field access including KYC and bank. Requires `user_profile.create`, which is held by super-admin and admin.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-profiles` |
| Permission | `user_profile.create` |

**Request body** — `userId` is required; every other field is optional. Example:

```json
{
  "userId": 8,
  "gender": "female",
  "nationality": "Indian",
  "addressLine1": "42, Park Street",
  "countryId": 1,
  "stateId": 1,
  "cityId": 1,
  "pincode": "700016",
  "aadharNumber": "XXXX-XXXX-1234",
  "panNumber": "ABCDE1234F",
  "bankName": "State Bank of India",
  "bankIfscCode": "SBIN0001234",
  "profileCompletion": 60
}
```

### Responses

#### 201 Created

Same DTO shape as §1.1.

#### 400 Bad request — parent user does not exist or is soft-deleted

```json
{
  "success": false,
  "message": "Error inserting user profile: User id 99999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 1.7 `PATCH /api/v1/user-profiles/:id`

Partial update. `authorizeSelfOr` lets admins use this on any row and lets students/instructors use it on their own row.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-profiles/:id` |
| Permission | `user_profile.update` *or* `user_profile.update.own` |

**Request body** — any subset of the full field set. Unlike `PATCH /me`, sensitive fields are allowed here. Example:

```json
{
  "headline": "Platform Administrator | GrowUpMore",
  "bankIfscCode": "HDFC0001234",
  "profileCompletion": 85
}
```

### Responses

#### 200 OK

Full updated `UserProfileDto`.

#### 403 Forbidden — own-scope caller on a foreign row

Same as §1.5.

#### 400 Bad request — foreign key validation

```json
{
  "success": false,
  "message": "Error updating user profile: Country id 99999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 1.8 `DELETE /api/v1/user-profiles/:id`

Hard-delete a profile row. Does **not** touch the parent `users` row.

This endpoint is super-admin-only. Admins have `user_profile.update` and can clear individual fields with `PATCH /:id`, but they cannot hard-delete the row. To additionally enforce this even if a future seed accidentally granted `user_profile.delete` to admin, the router layers a `requireSuperAdmin` role check on top of the permission check.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-profiles/:id` |
| Permission | `user_profile.delete` + role `super_admin` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User profile deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — admin caller

```json
{
  "success": false,
  "message": "Only super admins may hard-delete user profiles",
  "code": "FORBIDDEN"
}
```

#### 400 Bad request — unknown id

```json
{
  "success": false,
  "message": "Error deleting user profile: No user profile found with id 99999.",
  "code": "BAD_REQUEST"
}
```

---

## DTO reference

`UserProfileDto` is deeply nested — the full TypeScript definition lives in [`api/src/modules/user-profiles/user-profiles.service.ts`](../../../api/src/modules/user-profiles/user-profiles.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId` | Primary keys — profile id and owning user id (1:1). |
| `dateOfBirth`, `gender`, `bloodGroup`, `maritalStatus`, `nationality`, `about`, `headline`, `profilePhotoUrl`, `coverPhotoUrl` | Personal info. |
| `permanentAddress`, `currentAddress` | Address blocks with ids and resolved names. |
| `contact` | `alternateEmail`, `alternateMobile`, `whatsappNumber`. |
| `emergency` | Emergency contact name / phone / relation. |
| `kyc` | Aadhar / PAN / passport. |
| `bank` | Bank name, account, IFSC, branch, account type, UPI, GST. |
| `preferences` | Preferred language (with resolved names), timezone, theme, notification channels. |
| `profileCompletion`, `isProfileComplete` | 0..100 percent + boolean flag. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit. |
| `userIsActive`, `userIsDeleted` | Inherited status from the parent users row. |
| `user` | Nested owner summary (name, email, role, country). |

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)
