-- Create labels table
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TRIGGER IF NOT EXISTS update_labels_updated_at
BEFORE UPDATE ON public.labels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create chat_labels join table
CREATE TABLE IF NOT EXISTS public.chat_labels (
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, label_id)
);

CREATE INDEX IF NOT EXISTS chat_labels_chat_id_idx
  ON public.chat_labels(chat_id);

CREATE INDEX IF NOT EXISTS chat_labels_label_id_idx
  ON public.chat_labels(label_id);

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Labels can be viewed by permitted users"
ON public.labels
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_labels cl
      JOIN public.chats ch ON ch.id = cl.chat_id
      WHERE cl.label_id = public.labels.id
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
);

CREATE POLICY "Labels can be updated by permitted users"
ON public.labels
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_labels cl
      JOIN public.chats ch ON ch.id = cl.chat_id
      WHERE cl.label_id = public.labels.id
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
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_labels cl
      JOIN public.chats ch ON ch.id = cl.chat_id
      WHERE cl.label_id = public.labels.id
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
);

CREATE POLICY "Labels can be inserted by permitted users"
ON public.labels
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE (
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
);

CREATE POLICY "Labels can be deleted by permitted users"
ON public.labels
FOR DELETE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_labels cl
      JOIN public.chats ch ON ch.id = cl.chat_id
      WHERE cl.label_id = public.labels.id
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
);

CREATE POLICY "Chat labels can be viewed by permitted users"
ON public.chat_labels
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE ch.id = public.chat_labels.chat_id
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
);

CREATE POLICY "Chat labels can be inserted by permitted users"
ON public.chat_labels
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE ch.id = public.chat_labels.chat_id
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
);

CREATE POLICY "Chat labels can be deleted by permitted users"
ON public.chat_labels
FOR DELETE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE ch.id = public.chat_labels.chat_id
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
);

CREATE POLICY "Chat labels can be updated by permitted users"
ON public.chat_labels
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE ch.id = public.chat_labels.chat_id
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
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE ch.id = public.chat_labels.chat_id
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
);
