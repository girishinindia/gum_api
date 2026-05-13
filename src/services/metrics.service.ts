/**
 * Metrics Service (Phase 7.6)
 * ───────────────────────────
 * Prometheus-style metrics via prom-client. Wraps the default registry
 * + a few custom counters/histograms for the bits we actually care about.
 *
 * Exposed at GET /metrics (see app.ts). Enabled via METRICS_ENABLED env.
 * In prod, restrict /metrics access to the internal scrape network using
 * METRICS_ALLOWED_IPS (comma-separated CIDRs/IPs).
 */

import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

// Default Node.js metrics (event loop lag, heap, GC, etc.)
collectDefaultMetrics({ register: registry, prefix: 'gum_' });

// ── Custom metrics ──────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'gum_http_requests_total',
  help: 'Total HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'gum_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const paymentEventsTotal = new Counter({
  name: 'gum_payment_events_total',
  help: 'Razorpay payment events processed',
  labelNames: ['kind', 'status'] as const,    // kind: verify|webhook|refund, status: ok|duplicate|failed
  registers: [registry],
});

export const walletOperationsTotal = new Counter({
  name: 'gum_wallet_operations_total',
  help: 'Wallet credit/debit operations',
  labelNames: ['op', 'status'] as const,      // op: credit|debit, status: ok|duplicate|frozen|insufficient|failed
  registers: [registry],
});

export const queueJobsTotal = new Counter({
  name: 'gum_queue_jobs_total',
  help: 'Total queue jobs by state',
  labelNames: ['queue', 'state'] as const,    // state: enqueued|completed|failed
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'gum_queue_depth',
  help: 'Current job count in each queue state',
  labelNames: ['queue', 'state'] as const,    // state: waiting|active|delayed|failed
  registers: [registry],
});

export const otpEventsTotal = new Counter({
  name: 'gum_otp_events_total',
  help: 'OTP lifecycle events',
  labelNames: ['channel', 'event'] as const,  // channel: email|sms, event: sent|verified|failed|resent
  registers: [registry],
});

// Phase 11.4.2 — UDF call timings. One label per RPC name keeps cardinality
// bounded (~60 known functions) so this is safe.
export const rpcCallsTotal = new Counter({
  name: 'gum_rpc_calls_total',
  help: 'Postgres function (RPC) invocations via db.callFn()',
  labelNames: ['fn', 'status'] as const,           // status: ok|error
  registers: [registry],
});

export const rpcCallDurationSeconds = new Histogram({
  name: 'gum_rpc_call_duration_seconds',
  help: 'Latency of Postgres function calls via db.callFn()',
  labelNames: ['fn'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Record an HTTP request. Call from a middleware in app.ts when
 * METRICS_ENABLED. Route should be the pattern, not the concrete URL,
 * to avoid label explosion (e.g. `/api/v1/users/:id` not `/api/v1/users/42`).
 */
export function recordHttp(method: string, route: string, status: number, durationSeconds: number) {
  const labels = { method, route, status: String(status) };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

/**
 * Refresh the gauge from the live queue stats. Cheap to call on every
 * /metrics scrape (~once per 15s in typical Prometheus deployments).
 */
export async function refreshQueueDepthGauge(): Promise<void> {
  const { getAllQueueStats, isQueueEnabled } = await import('./queue.service');
  if (!isQueueEnabled()) return;
  const stats = await getAllQueueStats();
  for (const s of stats) {
    queueDepth.set({ queue: s.name, state: 'waiting' }, s.waiting);
    queueDepth.set({ queue: s.name, state: 'active' }, s.active);
    queueDepth.set({ queue: s.name, state: 'delayed' }, s.delayed);
    queueDepth.set({ queue: s.name, state: 'failed' }, s.failed);
  }
}
