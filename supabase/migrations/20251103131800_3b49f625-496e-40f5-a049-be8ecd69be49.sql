-- Cria a tabela credential_members para gerenciar membros de credenciais
CREATE TABLE IF NOT EXISTS public.credential_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'agent', 'supervisor', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(credential_id, user_id)
);

-- Habilita RLS
ALTER TABLE public.credential_members ENABLE ROW LEVEL SECURITY;

-- Policies para credential_members
CREATE POLICY "Members can view their own memberships"
ON public.credential_members
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners can manage members"
ON public.credential_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.credential_members cm
    WHERE cm.credential_id = credential_members.credential_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'owner'
  )
);

CREATE POLICY "Members can insert themselves"
ON public.credential_members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Cria a tabela labels para etiquetas/tags de conversas
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#808080',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(credential_id, name)
);

-- Habilita RLS
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

-- Policies para labels
CREATE POLICY "Labels are viewable by credential members"
ON public.labels
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.credential_members cm
    WHERE cm.credential_id = labels.credential_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Labels can be created by credential members"
ON public.labels
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.credential_members cm
    WHERE cm.credential_id = labels.credential_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Labels can be updated by credential members"
ON public.labels
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.credential_members cm
    WHERE cm.credential_id = labels.credential_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Labels can be deleted by credential owners"
ON public.labels
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.credential_members cm
    WHERE cm.credential_id = labels.credential_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'owner'
  )
);

-- Cria tabela de relacionamento entre chats e labels
CREATE TABLE IF NOT EXISTS public.chat_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(chat_id, label_id)
);

-- Habilita RLS
ALTER TABLE public.chat_labels ENABLE ROW LEVEL SECURITY;

-- Policies para chat_labels
CREATE POLICY "Chat labels are viewable by everyone"
ON public.chat_labels
FOR SELECT
USING (true);

CREATE POLICY "Chat labels can be created by anyone"
ON public.chat_labels
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Chat labels can be deleted by anyone"
ON public.chat_labels
FOR DELETE
USING (true);

-- Cria índices para performance
CREATE INDEX IF NOT EXISTS idx_credential_members_user ON public.credential_members(user_id);
CREATE INDEX IF NOT EXISTS idx_credential_members_credential ON public.credential_members(credential_id);
CREATE INDEX IF NOT EXISTS idx_labels_credential ON public.labels(credential_id);
CREATE INDEX IF NOT EXISTS idx_chat_labels_chat ON public.chat_labels(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_labels_label ON public.chat_labels(label_id);