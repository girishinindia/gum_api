-- ============================================================
-- 48_webhook_events.sql
-- Phase 2.1 — Webhook idempotency
--   Razorpay (and later Bunny Stream, RazorpayX) can re-deliver events.
--   This table is the single source of truth on "have we processed this
--   event already?" — checked + inserted in one atomic statement, so a
--   second delivery becomes a no-op even under concurrency.
--
-- Applied to live DB as migration: phase2_webhook_events_table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id            BIGSERIAL PRIMARY KEY,
  provider      VARCHAR(32)  NOT NULL,           -- 'razorpay', 'bunny_stream', 'razorpayx'
  event_id      VARCHAR(255) NOT NULL,           -- provider-supplied unique id
  event_type    VARCHAR(100) NOT NULL,           -- e.g. 'payment.captured'
  payload_hash  VARCHAR(64),                     -- sha256 of raw body
  payload       JSONB,
  status        VARCHAR(20) NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','processing','processed','failed','skipped')),
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  related_type  VARCHAR(50),
  related_id    BIGINT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  ip_address    VARCHAR(45),
  user_agent    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_provider_event_id
  ON public.webhook_events (provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON public.webhook_events (status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_related
  ON public.webhook_events (related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type
  ON public.webhook_events (event_type);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
