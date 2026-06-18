-- ─────────────────────────────────────────────────────────────────
-- Phase 45 — push_devices: add FCM (mobile) support alongside Web Push
--
-- The table was Web-Push-only (endpoint + p256dh + auth). Mobile devices
-- (Flutter Android/iOS) authenticate with an opaque FCM token instead of a
-- subscription endpoint. We add a `provider` discriminator and an `fcm_token`
-- column, and relax the web-push columns to nullable so FCM rows can omit them.
--
-- Backward compatible: existing rows default to provider='webpush' and keep
-- their endpoint/keys. NULLs are distinct under UNIQUE, so the existing
-- endpoint uniqueness and the new fcm_token uniqueness never collide.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.push_devices
  ADD COLUMN IF NOT EXISTS provider  varchar(10) NOT NULL DEFAULT 'webpush',
  ADD COLUMN IF NOT EXISTS fcm_token text;

-- FCM rows carry a token, not an endpoint/keys → relax web-push columns.
ALTER TABLE public.push_devices ALTER COLUMN endpoint DROP NOT NULL;
ALTER TABLE public.push_devices ALTER COLUMN p256dh   DROP NOT NULL;
ALTER TABLE public.push_devices ALTER COLUMN auth     DROP NOT NULL;

-- provider must be one of the two known transports.
ALTER TABLE public.push_devices DROP CONSTRAINT IF EXISTS push_devices_provider_chk;
ALTER TABLE public.push_devices ADD  CONSTRAINT push_devices_provider_chk
  CHECK (provider IN ('webpush', 'fcm'));

-- shape integrity: web rows need an endpoint, FCM rows need a token.
ALTER TABLE public.push_devices DROP CONSTRAINT IF EXISTS push_devices_shape_chk;
ALTER TABLE public.push_devices ADD  CONSTRAINT push_devices_shape_chk
  CHECK (
    (provider = 'webpush' AND endpoint  IS NOT NULL) OR
    (provider = 'fcm'     AND fcm_token IS NOT NULL)
  );

-- unique FCM token (multiple NULLs allowed → web-push rows unaffected).
ALTER TABLE public.push_devices DROP CONSTRAINT IF EXISTS push_devices_fcm_token_uniq;
ALTER TABLE public.push_devices ADD  CONSTRAINT push_devices_fcm_token_uniq UNIQUE (fcm_token);

CREATE INDEX IF NOT EXISTS push_devices_user_provider_active_idx
  ON public.push_devices (user_id, provider)
  WHERE is_active = true AND deleted_at IS NULL;
