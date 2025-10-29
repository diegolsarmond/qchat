-- Scope labels to individual users and update row level security policies

ALTER TABLE public.labels
  ADD COLUMN user_id UUID;

-- Populate user_id for existing labels using the owning chat
UPDATE public.labels AS l
SET user_id = ch.user_id
FROM public.chat_labels AS cl
JOIN public.chats AS ch ON ch.id = cl.chat_id
WHERE cl.label_id = l.id
  AND l.user_id IS NULL;

ALTER TABLE public.labels
  ADD CONSTRAINT labels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.labels
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.labels
  DROP CONSTRAINT IF EXISTS labels_name_key;

ALTER TABLE public.labels
  ADD CONSTRAINT labels_user_id_name_key UNIQUE (user_id, name);

CREATE INDEX IF NOT EXISTS labels_user_id_idx
  ON public.labels(user_id);

-- Refresh label policies to allow direct owners to manage their labels
DROP POLICY IF EXISTS "Labels can be viewed by permitted users" ON public.labels;
CREATE POLICY "Labels can be viewed by permitted users"
ON public.labels
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      public.labels.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.chat_labels cl
        JOIN public.chats ch ON ch.id = cl.chat_id
        WHERE cl.label_id = public.labels.id
          AND ch.user_id = public.labels.user_id
          AND (
            auth.uid() = ch.assigned_to
            OR auth.uid() = ch.user_id
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

DROP POLICY IF EXISTS "Labels can be updated by permitted users" ON public.labels;
CREATE POLICY "Labels can be updated by permitted users"
ON public.labels
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      public.labels.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.chat_labels cl
        JOIN public.chats ch ON ch.id = cl.chat_id
        WHERE cl.label_id = public.labels.id
          AND ch.user_id = public.labels.user_id
          AND (
            auth.uid() = ch.assigned_to
            OR auth.uid() = ch.user_id
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
      public.labels.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.chat_labels cl
        JOIN public.chats ch ON ch.id = cl.chat_id
        WHERE cl.label_id = public.labels.id
          AND ch.user_id = public.labels.user_id
          AND (
            auth.uid() = ch.assigned_to
            OR auth.uid() = ch.user_id
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

DROP POLICY IF EXISTS "Labels can be inserted by permitted users" ON public.labels;
CREATE POLICY "Labels can be inserted by permitted users"
ON public.labels
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      public.labels.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.chats ch
        WHERE ch.user_id = public.labels.user_id
          AND (
            auth.uid() = ch.assigned_to
            OR auth.uid() = ch.user_id
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

DROP POLICY IF EXISTS "Labels can be deleted by permitted users" ON public.labels;
CREATE POLICY "Labels can be deleted by permitted users"
ON public.labels
FOR DELETE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND (
      public.labels.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.chat_labels cl
        JOIN public.chats ch ON ch.id = cl.chat_id
        WHERE cl.label_id = public.labels.id
          AND ch.user_id = public.labels.user_id
          AND (
            auth.uid() = ch.assigned_to
            OR auth.uid() = ch.user_id
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
