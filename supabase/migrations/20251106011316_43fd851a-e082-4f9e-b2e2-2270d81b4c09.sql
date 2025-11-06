-- Update messages RLS policies to allow proper operations
DROP POLICY IF EXISTS "Messages are viewable by everyone" ON public.messages;
DROP POLICY IF EXISTS "Messages can be created by anyone" ON public.messages;

-- Create proper RLS policies for messages
CREATE POLICY "Messages are viewable by everyone" 
ON public.messages
FOR SELECT
TO public
USING (true);

CREATE POLICY "Messages can be created by anyone" 
ON public.messages
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Messages can be updated by anyone" 
ON public.messages
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);