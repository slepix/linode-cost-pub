/*
  # Fix registration_open function

  ## Summary
  Recreates the registration_open() function without SECURITY DEFINER
  and grants explicit execute to anon and authenticated roles.
  The function simply checks if org_users table has any rows.
  Since this is called by unauthenticated users (anon role), we need
  a separate RLS policy to allow anon to read the count.
*/

DROP FUNCTION IF EXISTS public.registration_open();

CREATE OR REPLACE FUNCTION public.registration_open()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.org_users LIMIT 1);
$$;

ALTER FUNCTION public.registration_open() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_open() TO anon;
GRANT EXECUTE ON FUNCTION public.registration_open() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_open() TO service_role;

CREATE POLICY "anon can count org_users for registration check"
  ON public.org_users
  FOR SELECT
  TO anon
  USING (true);
