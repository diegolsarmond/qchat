-- Ensure credentials are associated with authenticated users
ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_credentials_user_id
  ON public.credentials(user_id);
