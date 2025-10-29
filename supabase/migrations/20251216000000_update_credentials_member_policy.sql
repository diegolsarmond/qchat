DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credentials'
      AND policyname = 'Owners can update credentials'
  ) THEN
    EXECUTE 'ALTER POLICY "Owners can update credentials" '
         'ON public.credentials '
         'USING ( '
         '  auth.uid() = user_id '
         '  OR EXISTS ( '
         '    SELECT 1 '
         '    FROM public.credential_members members '
         '    WHERE members.credential_id = public.credentials.id '
         '      AND members.user_id = auth.uid() '
         '      AND members.role IN (''owner'', ''admin'') '
         '  ) '
         ') '
         'WITH CHECK ( '
         '  auth.uid() = user_id '
         '  OR EXISTS ( '
         '    SELECT 1 '
         '    FROM public.credential_members members '
         '    WHERE members.credential_id = public.credentials.id '
         '      AND members.user_id = auth.uid() '
         '      AND members.role IN (''owner'', ''admin'') '
         '  ) '
         ')';
    EXECUTE 'ALTER POLICY "Owners can update credentials" '
         'ON public.credentials '
         'RENAME TO "Members can update credentials"';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credentials'
      AND policyname = 'Members can update credentials'
  ) THEN
    EXECUTE 'CREATE POLICY "Members can update credentials" '
         'ON public.credentials '
         'FOR UPDATE '
         'USING ( '
         '  auth.uid() = user_id '
         '  OR EXISTS ( '
         '    SELECT 1 '
         '    FROM public.credential_members members '
         '    WHERE members.credential_id = public.credentials.id '
         '      AND members.user_id = auth.uid() '
         '      AND members.role IN (''owner'', ''admin'') '
         '  ) '
         ') '
         'WITH CHECK ( '
         '  auth.uid() = user_id '
         '  OR EXISTS ( '
         '    SELECT 1 '
         '    FROM public.credential_members members '
         '    WHERE members.credential_id = public.credentials.id '
         '      AND members.user_id = auth.uid() '
         '      AND members.role IN (''owner'', ''admin'') '
         '  ) '
         ')';
  ELSE
    EXECUTE 'ALTER POLICY "Members can update credentials" '
         'ON public.credentials '
         'USING ( '
         '  auth.uid() = user_id '
         '  OR EXISTS ( '
         '    SELECT 1 '
         '    FROM public.credential_members members '
         '    WHERE members.credential_id = public.credentials.id '
         '      AND members.user_id = auth.uid() '
         '      AND members.role IN (''owner'', ''admin'') '
         '  ) '
         ') '
         'WITH CHECK ( '
         '  auth.uid() = user_id '
         '  OR EXISTS ( '
         '    SELECT 1 '
         '    FROM public.credential_members members '
         '    WHERE members.credential_id = public.credentials.id '
         '      AND members.user_id = auth.uid() '
         '      AND members.role IN (''owner'', ''admin'') '
         '  ) '
         ')';
  END IF;
END $$;
