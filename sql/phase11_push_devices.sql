-- ─────────────────────────────────────────────────────────────────
-- Phase 11.2.2 — push_devices table
--
-- One row per browser/device that has opted into Web Push notifications.
-- The "endpoint" is the URL the browser vendor (Mozilla, Apple, Google)
-- gave us — we POST encrypted payloads to it. p256dh + auth are the
-- ECDH keys needed to encrypt those payloads.
--
-- Tied to user_id with ON DELETE CASCADE so an account deletion
-- automatically revokes all push subscriptions.
--
-- Applied to live DB on 2026-05-13 via Supabase MCP migration
-- `phase11_push_devices`. Mirrored here for the repo history.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_devices (
  id            bigserial    PRIMARY KEY,
  user_id       bigint       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint      text         NOT NULL,
  p256dh        text         NOT NULL,
  auth          text         NOT NULL,
  user_agent    text,
  platform      varchar(20),
  is_active     boolean      NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT push_devices_endpoint_uniq UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_devices_user_id_active_idx
  ON public.push_devices (user_id) WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS push_devices_last_used_at_idx
  ON public.push_devices (last_used_at) WHERE is_active = true;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_devices_service_role ON public.push_devices;
CREATE POLICY push_devices_service_role
  ON public.push_devices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.push_devices FROM PUBLIC;
GRANT  ALL ON public.push_devices TO   service_role;

CREATE TRIGGER push_devices_set_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
