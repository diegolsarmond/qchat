-- Restrict credential updates to the owner of the credential
ALTER POLICY "Members can update credentials"
ON public.credentials
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

ALTER POLICY "Members can update credentials"
ON public.credentials
RENAME TO "Owners can update credentials";
