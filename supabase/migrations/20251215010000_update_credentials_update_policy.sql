-- Restrict credential updates to the owner of the credential
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credentials'
      AND policyname = 'Members can update credentials'
  ) THEN
    EXECUTE 'ALTER POLICY "Members can update credentials" ON public.credentials USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'ALTER POLICY "Members can update credentials" ON public.credentials RENAME TO "Owners can update credentials"';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credentials'
      AND policyname = 'Owners can update credentials'
  ) THEN
    EXECUTE 'ALTER POLICY "Owners can update credentials" ON public.credentials USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END
$$;
