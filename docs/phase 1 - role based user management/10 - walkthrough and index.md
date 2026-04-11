# Phase 1 — Walkthrough and Endpoint Index

← [09 user-permissions](09%20-%20user-permissions.md) · **Next →** [11 email notifications](11%20-%20email%20notifications.md)

A worked end-to-end happy path you can run with `curl`, followed by a flat table of every endpoint exposed in Phase 1 with its required permission code.

---

## Appendix A — A complete end-to-end happy-path walk-through

```bash
# 1. Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName":"Asha",
    "lastName":"Patel",
    "email":"asha.patel@example.com",
    "mobile":"9662278990",
    "password":"Welcome@2026",
    "roleCode":"student",
    "countryId":1
  }'
# → 201 { data: { userId: 42, devEmailOtp: "493017", devMobileOtp: "820146" } }

# 2. Use the dev OTPs to verify both channels (or wait for production delivery
#    to +919662278990 over SMS).
#    For the verify-* flows you'd first POST /verify-email with the bearer token,
#    then POST /verify-email/confirm with the otpId + otpCode.

# 3. Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "identifier":"asha.patel@example.com", "password":"Welcome@2026" }'
# → 200 { data: { accessToken, refreshToken, user, sessionId, ... } }

# 4. Call a protected route
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 5. Refresh
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{ \"refreshToken\":\"$REFRESH_TOKEN\" }"

# 6. Logout
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Appendix B — Endpoint index

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/v1/health` | public | — |
| GET | `/api/v1/health/ready` | public | — |
| POST | `/api/v1/auth/register` | public | — |
| POST | `/api/v1/auth/login` | public | — |
| POST | `/api/v1/auth/logout` | bearer | — |
| POST | `/api/v1/auth/refresh` | public | — |
| GET | `/api/v1/auth/me` | bearer | — |
| POST | `/api/v1/auth/forgot-password` | public | — |
| POST | `/api/v1/auth/forgot-password/verify` | public | — |
| POST | `/api/v1/auth/reset-password` | bearer | — |
| POST | `/api/v1/auth/reset-password/verify` | bearer | — |
| POST | `/api/v1/auth/verify-email` | bearer | — |
| POST | `/api/v1/auth/verify-email/confirm` | bearer | — |
| POST | `/api/v1/auth/verify-mobile` | bearer | — |
| POST | `/api/v1/auth/verify-mobile/confirm` | bearer | — |
| POST | `/api/v1/auth/change-email` | bearer | — |
| POST | `/api/v1/auth/change-email/confirm` | bearer | — |
| POST | `/api/v1/auth/change-mobile` | bearer | — |
| POST | `/api/v1/auth/change-mobile/confirm` | bearer | — |
| GET | `/api/v1/users` | bearer | `user.read` |
| GET | `/api/v1/users/:id` | bearer | `user.read` |
| POST | `/api/v1/users` | bearer | `user.create` |
| PATCH | `/api/v1/users/:id` | bearer | `user.update` |
| DELETE | `/api/v1/users/:id` | bearer | `user.delete` |
| POST | `/api/v1/users/:id/restore` | bearer | `user.restore` |
| POST | `/api/v1/users/:id/change-role` | bearer | `user.update` (super-admin) |
| POST | `/api/v1/users/:id/deactivate` | bearer | `user.update` (super-admin) |
| POST | `/api/v1/users/:id/set-verification` | bearer | `user.update` |
| GET | `/api/v1/countries` | bearer | `country.read` |
| GET | `/api/v1/countries/:id` | bearer | `country.read` |
| POST | `/api/v1/countries` | bearer | `country.create` |
| PATCH | `/api/v1/countries/:id` | bearer | `country.update` |
| DELETE | `/api/v1/countries/:id` | bearer | `country.delete` |
| POST | `/api/v1/countries/:id/restore` | bearer | `country.restore` |
| POST | `/api/v1/countries/:id/flag` | bearer | `country.update` (multipart, 25 KB / 90×90 / WebP) |
| GET | `/api/v1/roles` | bearer | `role.read` |
| GET | `/api/v1/roles/:id` | bearer | `role.read` |
| POST | `/api/v1/roles` | bearer | `role.create` |
| PATCH | `/api/v1/roles/:id` | bearer | `role.update` |
| DELETE | `/api/v1/roles/:id` | bearer | `role.delete` |
| POST | `/api/v1/roles/:id/restore` | bearer | `role.restore` |
| GET | `/api/v1/permissions` | bearer | `permission.read` |
| GET | `/api/v1/permissions/:id` | bearer | `permission.read` |
| POST | `/api/v1/permissions` | bearer | `permission.create` |
| PATCH | `/api/v1/permissions/:id` | bearer | `permission.update` |
| DELETE | `/api/v1/permissions/:id` | bearer | `permission.delete` |
| POST | `/api/v1/permissions/:id/restore` | bearer | `permission.restore` |
| GET | `/api/v1/role-permissions` | bearer | `permission.read` |
| GET | `/api/v1/role-permissions/:id` | bearer | `permission.read` |
| POST | `/api/v1/role-permissions` | bearer | `permission.assign` |
| POST | `/api/v1/role-permissions/revoke` | bearer | `permission.assign` |
| DELETE | `/api/v1/role-permissions/:id` | bearer | `permission.assign` |
| POST | `/api/v1/role-permissions/:id/restore` | bearer | `permission.assign` |
| GET | `/api/v1/user-permissions` | bearer | `permission.read` |
| GET | `/api/v1/user-permissions/:id` | bearer | `permission.read` |
| POST | `/api/v1/user-permissions` | bearer | `permission.assign` |
| POST | `/api/v1/user-permissions/revoke` | bearer | `permission.assign` |
| DELETE | `/api/v1/user-permissions/:id` | bearer | `permission.assign` |
| POST | `/api/v1/user-permissions/:id/restore` | bearer | `permission.assign` |
