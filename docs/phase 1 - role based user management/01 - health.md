# Phase 1 — Health

Liveness and readiness probes — no auth required, designed for load balancers and uptime monitors.

← [00 overview](00%20-%20overview.md) · **Next →** [02 auth core](02%20-%20auth%20core.md)

---

## 1.1 `GET /api/v1/health`

Returns immediately if the Node process is up.

**Response 200**

```json
{
  "success": true,
  "message": "Service is alive",
  "data": {
    "app": "GrowUpMore API",
    "env": "development",
    "version": "v1",
    "timestamp": "2026-04-10T08:30:00.000Z"
  }
}
```

---

## 1.2 `GET /api/v1/health/ready`

Pings PostgreSQL and Redis. Use this to gate traffic during deploys.

**Response 200 — all dependencies healthy**

```json
{
  "success": true,
  "message": "Ready",
  "data": { "database": "ok", "redis": "ok" }
}
```

**Response 503 — one or more dependencies unavailable**

```json
{
  "success": false,
  "message": "Not ready",
  "data": { "database": "ok", "redis": "fail" }
}
```
