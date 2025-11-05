-- Drop problematic policies that cause recursion
DROP POLICY IF EXISTS "Owners can manage all members" ON public.credential_members;
DROP POLICY IF EXISTS "Members can view their own memberships" ON public.credential_members;
DROP POLICY IF EXISTS "Members can insert themselves" ON public.credential_members;

-- Recreate the is_credential_member function to avoid recursion
CREATE OR REPLACE FUNCTION public.is_credential_owner(_user_id uuid, _credential_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.credential_members
    WHERE user_id = _user_id 
      AND credential_id = _credential_id 
      AND role = 'owner'
  )
$$;

-- Create new policies using SECURITY DEFINER functions
CREATE POLICY "Members can view their own memberships v2" 
ON public.credential_members
FOR SELECT
TO public
USING (auth.uid() = user_id);

CREATE POLICY "Members can insert themselves v2" 
ON public.credential_members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can manage all members v2" 
ON public.credential_members
FOR ALL
TO public
USING (public.is_credential_owner(auth.uid(), credential_id));

-- Update labels policies to use the new function
DROP POLICY IF EXISTS "Labels can be deleted by credential owners" ON public.labels;

CREATE POLICY "Labels can be deleted by credential owners v2" 
ON public.labels
FOR DELETE
TO public
USING (public.is_credential_owner(auth.uid(), credential_id));