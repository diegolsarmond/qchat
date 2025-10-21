-- Adicionar coluna user_id à tabela credentials
ALTER TABLE public.credentials
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Remover políticas antigas muito permissivas
DROP POLICY IF EXISTS "Credentials are viewable by everyone" ON public.credentials;
DROP POLICY IF EXISTS "Credentials can be created by anyone" ON public.credentials;
DROP POLICY IF EXISTS "Credentials can be updated by anyone" ON public.credentials;

-- Criar políticas RLS seguras
CREATE POLICY "Users can view their own credentials"
ON public.credentials
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own credentials"
ON public.credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
ON public.credentials
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
ON public.credentials
FOR DELETE
USING (auth.uid() = user_id);