DROP FUNCTION IF EXISTS public.chat_user_id_change_allowed(public.chats);
DROP FUNCTION IF EXISTS public.message_user_id_change_allowed(public.messages);
DROP FUNCTION IF EXISTS public.chat_user_id_guard();
DROP FUNCTION IF EXISTS public.message_user_id_guard();
DROP TRIGGER IF EXISTS chat_user_id_guard ON public.chats;
DROP TRIGGER IF EXISTS message_user_id_guard ON public.messages;

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

CREATE OR REPLACE FUNCTION public.chat_user_id_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL OR NEW.user_id = auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Changing chat user ownership is not allowed';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      IF NEW.user_id = auth.uid() THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Changing chat user ownership is not allowed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.message_user_id_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL OR NEW.user_id = auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Changing message user ownership is not allowed';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      IF NEW.user_id = auth.uid() THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Changing message user ownership is not allowed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_user_id_guard
BEFORE INSERT OR UPDATE OF user_id ON public.chats
FOR EACH ROW
EXECUTE FUNCTION public.chat_user_id_guard();

CREATE TRIGGER message_user_id_guard
BEFORE INSERT OR UPDATE OF user_id ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.message_user_id_guard();

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
