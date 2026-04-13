# Phase 1 — Health

Liveness and readiness probes — no auth required, designed for load balancers and uptime monitors.

← [00 overview](00%20-%20overview.md) · **Next →** [02 auth core](02%20-%20auth%20core.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11) | `GET` | `{{baseUrl}}/api/v1/health` | — | Liveness probe — returns `{status:'ok'}` when the process is up. |
| [§1.2](#12) | `GET` | `{{baseUrl}}/api/v1/health/ready` | — | Readiness probe — checks DB/dependencies before marking ready. |

---

## 1.1 `GET /api/v1/health`

Returns immediately if the Node process is up.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/health` |
| Permission | public (no auth) |

**Headers** — none

**Request body** — none

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Service is alive",
  "data": {
    "app": "GrowUpMore API",
    "env": "development",
    "version": "v1",
    "timestamp": "2026-04-11T10:00:00.000Z"
  }
}
```

---

## 1.2 `GET /api/v1/health/ready`

Pings PostgreSQL and Redis. Use this to gate traffic during deploys.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/health/ready` |
| Permission | public (no auth) |

**Headers** — none

**Request body** — none

### Responses

#### 200 OK — all dependencies healthy

```json
{
  "success": true,
  "message": "Ready",
  "data": { "database": "ok", "redis": "ok" }
}
```

#### 503 Service Unavailable — one or more dependencies down

```json
{
  "success": false,
  "message": "Not ready",
  "code": "SERVICE_UNAVAILABLE",
  "data": { "database": "ok", "redis": "fail" }
}
```

---

## Common errors across all health routes

| HTTP | `code` | When |
|---|---|---|
| 500 | `INTERNAL_ERROR` | Unhandled exception. |
