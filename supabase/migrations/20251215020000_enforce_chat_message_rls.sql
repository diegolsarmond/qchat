DROP FUNCTION IF EXISTS public.chat_user_id_change_allowed(public.chats);
DROP FUNCTION IF EXISTS public.message_user_id_change_allowed(public.messages);

DROP POLICY IF EXISTS "Chats are viewable by everyone" ON public.chats;
DROP POLICY IF EXISTS "Chats can be created by anyone" ON public.chats;
DROP POLICY IF EXISTS "Chats can be updated by anyone" ON public.chats;
DROP POLICY IF EXISTS "Messages are viewable by everyone" ON public.messages;
DROP POLICY IF EXISTS "Messages can be created by anyone" ON public.messages;
DROP POLICY IF EXISTS "Users with access can view chats" ON public.chats;
DROP POLICY IF EXISTS "Users with access can update chats" ON public.chats;
DROP POLICY IF EXISTS "Service or owners can create chats" ON public.chats;
DROP POLICY IF EXISTS "Users with access can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users with access can update messages" ON public.messages;
DROP POLICY IF EXISTS "Service or owners can create messages" ON public.messages;

CREATE OR REPLACE FUNCTION public.chat_user_id_change_allowed(new_chat public.chats)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_user_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  SELECT user_id INTO existing_user_id
  FROM public.chats
  WHERE id = new_chat.id;

  IF NOT FOUND THEN
    RETURN new_chat.user_id IS NULL OR new_chat.user_id = auth.uid();
  END IF;

  IF existing_user_id IS DISTINCT FROM new_chat.user_id THEN
    RETURN new_chat.user_id = auth.uid();
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.message_user_id_change_allowed(new_message public.messages)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_user_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  SELECT user_id INTO existing_user_id
  FROM public.messages
  WHERE id = new_message.id;

  IF NOT FOUND THEN
    RETURN new_message.user_id IS NULL OR new_message.user_id = auth.uid();
  END IF;

  IF existing_user_id IS DISTINCT FROM new_message.user_id THEN
    RETURN new_message.user_id = auth.uid();
  END IF;

  RETURN true;
END;
$$;

CREATE POLICY "Chats can be viewed by permitted users"
ON public.chats
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = assigned_to
      OR auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.credentials c
        WHERE c.id = public.chats.credential_id
          AND c.user_id = auth.uid()
      )
      OR (
        assigned_to IS NULL
        AND (
          COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb #>> '{app_metadata,is_admin}'), 'false') = 'true'
          OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'admin'
          OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'), '') = 'admin'
        )
      )
    )
  )
);

CREATE POLICY "Chats can be updated by permitted users"
ON public.chats
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = assigned_to
      OR auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.credentials c
        WHERE c.id = public.chats.credential_id
          AND c.user_id = auth.uid()
      )
      OR (
        assigned_to IS NULL
        AND (
          COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb #>> '{app_metadata,is_admin}'), 'false') = 'true'
          OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'admin'
          OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'), '') = 'admin'
        )
      )
    )
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = assigned_to
      OR auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.credentials c
        WHERE c.id = public.chats.credential_id
          AND c.user_id = auth.uid()
      )
      OR (
        assigned_to IS NULL
        AND (
          COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb #>> '{app_metadata,is_admin}'), 'false') = 'true'
          OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'admin'
          OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'), '') = 'admin'
        )
      )
    )
  )
  AND public.chat_user_id_change_allowed(public.chats)
);

CREATE POLICY "Chats can be inserted by service or owners"
ON public.chats
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.credentials c
      WHERE c.id = public.chats.credential_id
        AND c.user_id = auth.uid()
    )
    AND (public.chats.user_id IS NULL OR public.chats.user_id = auth.uid())
  )
);

CREATE POLICY "Messages can be viewed by permitted users"
ON public.messages
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.credentials c
        WHERE c.id = public.messages.credential_id
          AND c.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.chats ch
        WHERE ch.id = public.messages.chat_id
          AND (
            ch.assigned_to = auth.uid()
            OR ch.user_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.credentials c
              WHERE c.id = ch.credential_id
                AND c.user_id = auth.uid()
            )
            OR (
              ch.assigned_to IS NULL
              AND (
                COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb #>> '{app_metadata,is_admin}'), 'false') = 'true'
                OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'admin'
                OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'), '') = 'admin'
              )
            )
          )
      )
    )
  )
);

CREATE POLICY "Messages can be updated by permitted users"
ON public.messages
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.credentials c
        WHERE c.id = public.messages.credential_id
          AND c.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.chats ch
        WHERE ch.id = public.messages.chat_id
          AND (
            ch.assigned_to = auth.uid()
            OR ch.user_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.credentials c
              WHERE c.id = ch.credential_id
                AND c.user_id = auth.uid()
            )
            OR (
              ch.assigned_to IS NULL
              AND (
                COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb #>> '{app_metadata,is_admin}'), 'false') = 'true'
                OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'admin'
                OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'), '') = 'admin'
              )
            )
          )
      )
    )
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.credentials c
        WHERE c.id = public.messages.credential_id
          AND c.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.chats ch
        WHERE ch.id = public.messages.chat_id
          AND (
            ch.assigned_to = auth.uid()
            OR ch.user_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.credentials c
              WHERE c.id = ch.credential_id
                AND c.user_id = auth.uid()
            )
            OR (
              ch.assigned_to IS NULL
              AND (
                COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb #>> '{app_metadata,is_admin}'), 'false') = 'true'
                OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'admin'
                OR COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'), '') = 'admin'
              )
            )
          )
      )
    )
  )
  AND public.message_user_id_change_allowed(public.messages)
);

CREATE POLICY "Messages can be inserted by service or owners"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.credentials c
      WHERE c.id = COALESCE(
        public.messages.credential_id,
        (SELECT ch.credential_id FROM public.chats ch WHERE ch.id = public.messages.chat_id)
      )
        AND c.user_id = auth.uid()
    )
    AND (public.messages.user_id IS NULL OR public.messages.user_id = auth.uid())
  )
);
