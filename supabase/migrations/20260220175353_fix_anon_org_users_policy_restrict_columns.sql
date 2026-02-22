/*
  # Restrict anon org_users policy to only allow existence check

  ## Summary
  The previous migration added an overly permissive anon SELECT policy.
  We replace it with a more restrictive approach: use a SECURITY DEFINER
  wrapper function so anon never directly queries org_users at all.

  We drop the permissive anon policy and restore SECURITY DEFINER on the
  registration_open function so it runs as the owner (postgres) and can
  read org_users without exposing data to anon role directly.
*/

DROP POLICY IF EXISTS "anon can count org_users for registration check" ON public.org_users;

DROP FUNCTION IF EXISTS public.registration_open();

CREATE OR REPLACE FUNCTION public.registration_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.org_users LIMIT 1);
$$;

ALTER FUNCTION public.registration_open() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_open() TO anon;
GRANT EXECUTE ON FUNCTION public.registration_open() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_open() TO service_role;
