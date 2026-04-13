# Phase 15 — Referral Codes

Referral codes allow students on the Grow Up More platform to refer others and earn rewards. Each student can have one active referral code. The code is auto-generated using the format: `UPPER(first_initial + last_5_chars_of_last_name) + '-' + 4_random_alphanumeric` (e.g., `PPIMPL-75A6`). Referral codes track discount percentage for referred users, referrer reward configuration (wallet_credit, discount_code, or cashback), and aggregate statistics (total_referrals, successful_referrals, total_earnings). Supports soft-delete and admin restore with one-active-per-student constraint on restore.

Permission codes: `referral_code.read`, `referral_code.create`, `referral_code.update`, `referral_code.delete`, `referral_code.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `referral_code.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1referral-codes) | `GET` | `/api/v1/referral-codes` | `referral_code.read` | List referral codes with pagination, search, filter, sort. |
| [§1.2](#12-get-apiv1referral-codesid) | `GET` | `/api/v1/referral-codes/:id` | `referral_code.read` | Get one referral code by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1referral-codes) | `POST` | `/api/v1/referral-codes` | `referral_code.create` | Create a new referral code. |
| [§1.4](#14-patch-apiv1referral-codesid) | `PATCH` | `/api/v1/referral-codes/:id` | `referral_code.update` | Update a referral code. |
| [§1.5](#15-delete-apiv1referral-codesid) | `DELETE` | `/api/v1/referral-codes/:id` | `referral_code.delete` | Soft-delete a referral code. |
| [§1.6](#16-post-apiv1referral-codesidrestore) | `POST` | `/api/v1/referral-codes/:id/restore` | `referral_code.restore` | Restore a soft-deleted referral code. |

---

## Enums reference

**referrerRewardType**: `wallet_credit`, `discount_code`, `cashback`

---

## 1.1 `GET /api/v1/referral-codes`

List all referral codes.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `studentId` | int | — | Filter by student. |
| `isActive` | bool | — | Filter active/inactive codes. |
| `isDeleted` | bool | `false` | Include soft-deleted codes. |
| `referrerRewardType` | enum | — | `wallet_credit`, `discount_code`, `cashback`. |
| `searchTerm` | string | — | Searches referral_code (ILIKE). |
| `sortColumn` | enum | `created_at` | See **Sort columns** below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

`id`, `student_id`, `discount_percentage`, `total_referrals`, `successful_referrals`, `total_earnings`, `created_at`, `updated_at`.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "studentId": 54,
      "referralCode": "PPIMPL-75A6",
      "discountPercentage": 10.00,
      "maxDiscountAmount": null,
      "referrerRewardPercentage": 10.00,
      "referrerRewardType": "wallet_credit",
      "totalReferrals": 0,
      "successfulReferrals": 0,
      "totalEarnings": 0,
      "createdBy": 54,
      "updatedBy": 54,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T17:00:00.000Z",
      "updatedAt": "2026-04-12T17:00:00.000Z",
      "deletedAt": null,
      "studentName": "Girish Admin"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 200 OK — empty result

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

#### 401 Unauthorized

```json
{ "success": false, "message": "Authentication required" }
```

#### 403 Forbidden

```json
{ "success": false, "message": "Insufficient permissions" }
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/referral-codes?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/referral-codes?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/referral-codes?pageIndex=1&pageSize=10` |
| 4 | Filter by studentId=54 | `{{baseUrl}}/api/v1/referral-codes?studentId=54` |
| 5 | Filter by studentId=100 | `{{baseUrl}}/api/v1/referral-codes?studentId=100` |
| 6 | Filter by isActive=true | `{{baseUrl}}/api/v1/referral-codes?isActive=true` |
| 7 | Filter by isActive=false | `{{baseUrl}}/api/v1/referral-codes?isActive=false` |
| 8 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/referral-codes?isDeleted=true` |
| 9 | Filter by referrerRewardType=wallet_credit | `{{baseUrl}}/api/v1/referral-codes?referrerRewardType=wallet_credit` |
| 10 | Filter by referrerRewardType=discount_code | `{{baseUrl}}/api/v1/referral-codes?referrerRewardType=discount_code` |
| 11 | Filter by referrerRewardType=cashback | `{{baseUrl}}/api/v1/referral-codes?referrerRewardType=cashback` |
| 12 | Search — "PPIMPL" | `{{baseUrl}}/api/v1/referral-codes?searchTerm=PPIMPL` |
| 13 | Search — "ABC" | `{{baseUrl}}/api/v1/referral-codes?searchTerm=ABC` |
| 14 | Filter student + active | `{{baseUrl}}/api/v1/referral-codes?studentId=54&isActive=true` |
| 15 | Filter student + inactive | `{{baseUrl}}/api/v1/referral-codes?studentId=54&isActive=false` |
| 16 | Filter active wallet rewards | `{{baseUrl}}/api/v1/referral-codes?isActive=true&referrerRewardType=wallet_credit` |
| 17 | Filter active discount rewards | `{{baseUrl}}/api/v1/referral-codes?isActive=true&referrerRewardType=discount_code` |
| 18 | Filter active cashback | `{{baseUrl}}/api/v1/referral-codes?isActive=true&referrerRewardType=cashback` |
| 19 | Sort by id ASC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=id&sortDirection=ASC` |
| 20 | Sort by id DESC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=id&sortDirection=DESC` |
| 21 | Sort by student_id ASC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=student_id&sortDirection=ASC` |
| 22 | Sort by student_id DESC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=student_id&sortDirection=DESC` |
| 23 | Sort by discount_percentage ASC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=discount_percentage&sortDirection=ASC` |
| 24 | Sort by discount_percentage DESC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=discount_percentage&sortDirection=DESC` |
| 25 | Sort by total_referrals DESC (most) | `{{baseUrl}}/api/v1/referral-codes?sortColumn=total_referrals&sortDirection=DESC` |
| 26 | Sort by successful_referrals DESC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=successful_referrals&sortDirection=DESC` |
| 27 | Sort by total_earnings DESC (highest earners) | `{{baseUrl}}/api/v1/referral-codes?sortColumn=total_earnings&sortDirection=DESC` |
| 28 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/referral-codes?sortColumn=created_at&sortDirection=DESC` |
| 29 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/referral-codes?sortColumn=updated_at&sortDirection=DESC` |
| 30 | Combo — student active codes by earnings | `{{baseUrl}}/api/v1/referral-codes?studentId=54&isActive=true&sortColumn=total_earnings&sortDirection=DESC` |
| 31 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/referral-codes?pageIndex=1&pageSize=10&isActive=true&referrerRewardType=wallet_credit&searchTerm=PP` |
| 32 | Combo — active wallet codes sorted by referrals | `{{baseUrl}}/api/v1/referral-codes?isActive=true&referrerRewardType=wallet_credit&sortColumn=total_referrals&sortDirection=DESC` |
| 33 | Combo — filter deleted + search | `{{baseUrl}}/api/v1/referral-codes?isDeleted=true&searchTerm=IMPL` |
| 34 | Combo — top earners (all active, sorted) | `{{baseUrl}}/api/v1/referral-codes?isActive=true&sortColumn=total_earnings&sortDirection=DESC&pageSize=10` |
| 35 | Combo — all reward types, newest first | `{{baseUrl}}/api/v1/referral-codes?sortColumn=created_at&sortDirection=DESC&pageSize=20` |

---

## 1.2 `GET /api/v1/referral-codes/:id`

Get a single referral code by ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §1.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Referral code 999 not found" }
```

---

## 1.3 `POST /api/v1/referral-codes`

Create a new referral code.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentId` | int | **yes** | Must reference valid, non-deleted student. |
| `referralCode` | string | no | Auto-generated if omitted. Format: `UPPER(first_initial + last_5_chars) + '-' + 4_random_alphanumeric`. 1-100 chars. |
| `discountPercentage` | number | no | Default: 0. Range: 0-100. |
| `maxDiscountAmount` | number | no | Default: null. Range: 0-99999999.99. |
| `referrerRewardPercentage` | number | no | Default: 0. Range: 0-100. |
| `referrerRewardType` | enum | no | Default: `wallet_credit`. Values: `wallet_credit`, `discount_code`, `cashback`. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "studentId": 54,
  "referralCode": "PPIMPL-75A6",
  "discountPercentage": 10.00,
  "maxDiscountAmount": null,
  "referrerRewardPercentage": 10.00,
  "referrerRewardType": "wallet_credit",
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Referral code created",
  "data": { "id": 1, "studentId": 54, "referralCode": "PPIMPL-75A6", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "student_id 999 does not exist or is deleted." }
```

```json
{ "success": false, "message": "discountPercentage must be between 0 and 100." }
```

```json
{ "success": false, "message": "maxDiscountAmount must be between 0 and 99999999.99." }
```

```json
{ "success": false, "message": "referralCode must be between 1 and 100 characters." }
```

---

## 1.4 `PATCH /api/v1/referral-codes/:id`

Update a referral code. `student_id` and `referral_code` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `discountPercentage` | number | 0-100. |
| `maxDiscountAmount` | number | 0-99999999.99. |
| `referrerRewardPercentage` | number | 0-100. |
| `referrerRewardType` | enum | `wallet_credit`, `discount_code`, `cashback`. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated referral code (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "discountPercentage must be between 0 and 100." }
```

```json
{ "success": false, "message": "student_id and referral_code are immutable." }
```

#### 404 Not Found

```json
{ "success": false, "message": "referral_code_id 999 does not exist or is deleted." }
```

---

## 1.5 `DELETE /api/v1/referral-codes/:id`

Soft-delete a referral code.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Referral code deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "referral_code_id 1 is already deleted." }
```

---

## 1.6 `POST /api/v1/referral-codes/:id/restore`

Restore a soft-deleted referral code. Validates one-active-per-student constraint: cannot restore if another active code exists for the same student.

### Responses

#### 200 OK

Returns the restored referral code (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "referral_code_id 1 is not deleted." }
```

```json
{ "success": false, "message": "Cannot restore: another active referral code already exists for student_id 54." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `500` | Internal server error. |
