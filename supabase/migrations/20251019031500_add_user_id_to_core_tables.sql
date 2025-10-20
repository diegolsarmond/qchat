ALTER TABLE public.credentials ADD COLUMN user_id uuid;
ALTER TABLE public.chats ADD COLUMN user_id uuid;
ALTER TABLE public.messages ADD COLUMN user_id uuid;

ALTER TABLE public.credentials
  ADD CONSTRAINT credentials_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

WITH owner AS (
  SELECT id FROM auth.users ORDER BY created_at LIMIT 1
)
UPDATE public.credentials
SET user_id = owner.id
FROM owner
WHERE user_id IS NULL;

UPDATE public.chats AS c
SET user_id = cred.user_id
FROM public.credentials AS cred
WHERE c.credential_id = cred.id
  AND c.user_id IS NULL;

UPDATE public.messages AS m
SET user_id = ch.user_id
FROM public.chats AS ch
WHERE m.chat_id = ch.id
  AND m.user_id IS NULL;

ALTER TABLE public.credentials ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.chats ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN user_id SET NOT NULL;

DROP POLICY IF EXISTS "Credentials are viewable by everyone" ON public.credentials;
DROP POLICY IF EXISTS "Credentials can be created by anyone" ON public.credentials;
DROP POLICY IF EXISTS "Credentials can be updated by anyone" ON public.credentials;

DROP POLICY IF EXISTS "Chats are viewable by everyone" ON public.chats;
DROP POLICY IF EXISTS "Chats can be created by anyone" ON public.chats;
DROP POLICY IF EXISTS "Chats can be updated by anyone" ON public.chats;

DROP POLICY IF EXISTS "Messages are viewable by everyone" ON public.messages;
DROP POLICY IF EXISTS "Messages can be created by anyone" ON public.messages;

CREATE POLICY "Credentials owner select" ON public.credentials
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Credentials owner insert" ON public.credentials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Credentials owner update" ON public.credentials
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Chats scoped access" ON public.chats
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      assigned_to IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = assigned_to
          AND u.email IS NOT NULL
          AND current_setting('request.jwt.claim.email', true) = u.email
      )
    )
  );

CREATE POLICY "Chats scoped insert" ON public.chats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Chats scoped update" ON public.chats
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (
      assigned_to IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = assigned_to
          AND u.email IS NOT NULL
          AND current_setting('request.jwt.claim.email', true) = u.email
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      assigned_to IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = assigned_to
          AND u.email IS NOT NULL
          AND current_setting('request.jwt.claim.email', true) = u.email
      )
    )
  );

CREATE POLICY "Messages owner select" ON public.messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Messages owner insert" ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Messages owner update" ON public.messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_credentials_user_id ON public.credentials(user_id);
CREATE INDEX idx_chats_user_id ON public.chats(user_id);
CREATE INDEX idx_messages_user_id ON public.messages(user_id);
