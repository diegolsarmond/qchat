-- Add missing columns to chats table
ALTER TABLE chats ADD COLUMN IF NOT EXISTS attendance_status text DEFAULT 'waiting';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Add missing columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS credential_id uuid REFERENCES credentials(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- Create user_roles table for proper role management
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'owner');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create security definer function to check credential membership (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_credential_member(_user_id uuid, _credential_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.credential_members
    WHERE user_id = _user_id AND credential_id = _credential_id
  )
$$;

-- Add is_active column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chats_attendance_status ON chats(attendance_status);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_credential_id ON messages(credential_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Update credential_members RLS policies to use security definer function
DROP POLICY IF EXISTS "Owners can manage members" ON credential_members;
DROP POLICY IF EXISTS "Members can view their own memberships" ON credential_members;

CREATE POLICY "Members can view their own memberships"
ON credential_members
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Owners can manage all members"
ON credential_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM credential_members cm
    WHERE cm.credential_id = credential_members.credential_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  )
);

-- Update labels RLS policies to prevent recursion
DROP POLICY IF EXISTS "Labels are viewable by credential members" ON labels;
DROP POLICY IF EXISTS "Labels can be created by credential members" ON labels;
DROP POLICY IF EXISTS "Labels can be updated by credential members" ON labels;
DROP POLICY IF EXISTS "Labels can be deleted by credential owners" ON labels;

CREATE POLICY "Labels are viewable by credential members"
ON labels
FOR SELECT
USING (public.is_credential_member(auth.uid(), credential_id));

CREATE POLICY "Labels can be created by credential members"
ON labels
FOR INSERT
WITH CHECK (public.is_credential_member(auth.uid(), credential_id));

CREATE POLICY "Labels can be updated by credential members"
ON labels
FOR UPDATE
USING (public.is_credential_member(auth.uid(), credential_id));

CREATE POLICY "Labels can be deleted by credential owners"
ON labels
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM credential_members cm
    WHERE cm.credential_id = labels.credential_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  )
);

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));