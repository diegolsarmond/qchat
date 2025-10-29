-- Create table for credential membership management
CREATE TABLE IF NOT EXISTS public.credential_members (
  credential_id UUID NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_credential_members_user_id
  ON public.credential_members(user_id);

-- Backfill owners
INSERT INTO public.credential_members (credential_id, user_id, role)
SELECT id, user_id, 'owner'
FROM public.credentials
WHERE user_id IS NOT NULL
ON CONFLICT (credential_id, user_id) DO NOTHING;

-- Backfill assigned agents
INSERT INTO public.credential_members (credential_id, user_id, role)
SELECT DISTINCT credential_id, assigned_to, 'agent'
FROM public.chats
WHERE assigned_to IS NOT NULL
ON CONFLICT (credential_id, user_id) DO NOTHING;

ALTER TABLE public.credential_members ENABLE ROW LEVEL SECURITY;

-- Policy: allow members to view their own memberships
CREATE POLICY "Members can view their memberships"
ON public.credential_members
FOR SELECT
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1
    FROM public.credential_members owners
    WHERE owners.credential_id = credential_members.credential_id
      AND owners.user_id = auth.uid()
      AND owners.role IN ('owner', 'admin')
  )
);

-- Policy: owners can manage members
CREATE POLICY "Owners can manage credential members"
ON public.credential_members
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.credential_members owners
    WHERE owners.credential_id = credential_members.credential_id
      AND owners.user_id = auth.uid()
      AND owners.role IN ('owner', 'admin')
  )
  OR (
    auth.uid() = credential_members.user_id
    AND credential_members.role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.credentials c
      WHERE c.id = credential_members.credential_id
        AND c.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.credential_members owners
    WHERE owners.credential_id = credential_members.credential_id
      AND owners.user_id = auth.uid()
      AND owners.role IN ('owner', 'admin')
  )
  OR (
    auth.uid() = credential_members.user_id
    AND credential_members.role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.credentials c
      WHERE c.id = credential_members.credential_id
        AND c.user_id = auth.uid()
    )
  )
);

-- Update credential policies to include members
DROP POLICY IF EXISTS "Users can view their own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Users can create their own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Users can update their own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Users can delete their own credentials" ON public.credentials;

CREATE POLICY "Members can view credentials"
ON public.credentials
FOR SELECT
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1
    FROM public.credential_members members
    WHERE members.credential_id = public.credentials.id
      AND members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own credentials"
ON public.credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update credentials"
ON public.credentials
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
ON public.credentials
FOR DELETE
USING (auth.uid() = user_id);
