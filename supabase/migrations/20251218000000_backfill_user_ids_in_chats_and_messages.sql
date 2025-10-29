-- Associate chats and messages with credential owners
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_chats_user_id
  ON public.chats(user_id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON public.messages(user_id);

UPDATE public.chats AS c
SET user_id = cred.user_id
FROM public.credentials AS cred
WHERE c.credential_id = cred.id
  AND cred.user_id IS NOT NULL
  AND (c.user_id IS DISTINCT FROM cred.user_id);

UPDATE public.messages AS m
SET user_id = cred.user_id
FROM public.credentials AS cred
WHERE m.credential_id = cred.id
  AND cred.user_id IS NOT NULL
  AND (m.user_id IS DISTINCT FROM cred.user_id);
