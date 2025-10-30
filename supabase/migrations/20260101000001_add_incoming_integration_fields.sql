ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS incoming_webhook_url text,
  ADD COLUMN IF NOT EXISTS incoming_webhook_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS incoming_sse_fallback_url text;
