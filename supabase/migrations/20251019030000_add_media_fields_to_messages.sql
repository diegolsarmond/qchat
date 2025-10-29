ALTER TABLE public.messages
  ADD COLUMN credential_id uuid,
  ADD COLUMN media_type text DEFAULT NULL,
  ADD COLUMN document_name text DEFAULT NULL,
  ADD COLUMN media_url text DEFAULT NULL,
  ADD COLUMN media_base64 text DEFAULT NULL,
  ADD COLUMN caption text DEFAULT NULL,
  ADD COLUMN is_private boolean NOT NULL DEFAULT false;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_credential_id_fkey
  FOREIGN KEY (credential_id)
  REFERENCES public.credentials(id)
  ON DELETE SET NULL;
