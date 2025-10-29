-- Revoke overly permissive policies on chats and messages
DROP POLICY IF EXISTS "Chats are viewable by everyone" ON public.chats;
DROP POLICY IF EXISTS "Chats can be created by anyone" ON public.chats;
DROP POLICY IF EXISTS "Chats can be updated by anyone" ON public.chats;
DROP POLICY IF EXISTS "Messages are viewable by everyone" ON public.messages;
DROP POLICY IF EXISTS "Messages can be created by anyone" ON public.messages;

-- Policies for chats
CREATE POLICY "Users with access can view chats"
ON public.chats
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = assigned_to
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

CREATE POLICY "Users with access can update chats"
ON public.chats
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = assigned_to
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

CREATE POLICY "Service or owners can create chats"
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
  )
);

-- Policies for messages
CREATE POLICY "Users with access can view messages"
ON public.messages
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
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
            OR EXISTS (
              SELECT 1
              FROM public.credentials c
              WHERE c.id = ch.credential_id
                AND c.user_id = auth.uid()
            )
          )
      )
    )
  )
);

CREATE POLICY "Users with access can update messages"
ON public.messages
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
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
            OR EXISTS (
              SELECT 1
              FROM public.credentials c
              WHERE c.id = ch.credential_id
                AND c.user_id = auth.uid()
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
      EXISTS (
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
            OR EXISTS (
              SELECT 1
              FROM public.credentials c
              WHERE c.id = ch.credential_id
                AND c.user_id = auth.uid()
            )
          )
      )
    )
  )
);

CREATE POLICY "Service or owners can create messages"
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
  )
);
